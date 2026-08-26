import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow } from '../../db/rows.js';

/**
 * Blast Radius data-access layer — the module's ONLY drizzle site.
 *
 * Like Smart Diff and Conventions before it, this module reads two tables it
 * does not own — `pull_requests` (for the tenancy gate) and `pr_files` (the
 * persisted changed-file list). That mirrors the documented precedent
 * (`server/INSIGHTS.md` 2026-08-08): a module needing another module's raw rows
 * queries them from its own `repository.ts` rather than bloating the sibling's
 * facade. We deliberately do NOT import `PullsRepository`.
 */
export class BlastRepository {
  constructor(private db: Db) {}

  /** Tenancy gate: the PR must belong to the caller's workspace. */
  async getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  /**
   * The PR's changed file paths — path only. This is the input the repo-intel
   * facade's `getBlastRadius` takes; we do not re-ship churn or patch text.
   */
  async listChangedFilePaths(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map((r) => r.path);
  }
}
