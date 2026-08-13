import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { PullRow, RepoRow } from '../../db/rows.js';
import * as t from '../../db/schema.js';

/**
 * F1 — polling data-access layer. The ONLY place in this module that touches
 * `pull_requests` and `repos`.
 *
 * `pull_requests` is also written by `modules/pulls/repository.ts`. The two
 * upserts are deliberately DUPLICATED rather than shared: a module never
 * imports a sibling's data layer, and a genuinely shared repository belongs on
 * the composition root (`container.agentsRepo` is the pattern) — which is a
 * separate change. Both copies must keep the same conflict target
 * (`repo_id, number`) or the idempotent-import contract breaks.
 */

export type { PullRow, RepoRow };

/**
 * One PR as the poll sees it on GitHub's PR-LIST payload.
 *
 * `openedAt` is absent on purpose: the manual poll has never written it, and
 * adding it here would change what an existing row looks like after a refresh.
 * `modules/pulls` does write it on its own import path.
 */
export interface UpsertPull {
  workspaceId: string;
  repoId: string;
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  additions: number;
  deletions: number;
  filesCount: number;
  status: string;
  updatedAt: Date | null;
}

export class PollingRepository {
  constructor(private db: Db) {}

  /** Tenancy-scoped repo lookup — the poll is addressed by repo id. */
  async findRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /**
   * The stored `id` + `head_sha` for one PR, or `undefined` if it is new to us.
   * Read BEFORE the upsert so the poll can tell a head-move (existing PR whose
   * head advanced) from a first-time import — the intent re-derive gate (8b).
   */
  async findPullHead(
    repoId: string,
    number: number,
  ): Promise<{ id: string; headSha: string } | undefined> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id, headSha: t.pullRequests.headSha })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, number)));
    return row;
  }

  /**
   * Idempotent import — unique on (repo_id, number). Only the fields that
   * actually move between polls are refreshed on conflict; author/branch/base
   * are immutable for a PR and the diff stats are owned by the backfill in
   * `modules/pulls`, so overwriting them from the list payload would zero them.
   */
  async upsertPull(values: UpsertPull): Promise<void> {
    await this.db
      .insert(t.pullRequests)
      .values(values)
      .onConflictDoUpdate({
        target: [t.pullRequests.repoId, t.pullRequests.number],
        set: {
          title: values.title,
          headSha: values.headSha,
          status: values.status,
          updatedAt: values.updatedAt,
        },
      });
  }

  /** Bump `last_polled_at` once a poll has synced the list. */
  async touchLastPolledAt(repoId: string, at: Date): Promise<void> {
    await this.db.update(t.repos).set({ lastPolledAt: at }).where(eq(t.repos.id, repoId));
  }
}
