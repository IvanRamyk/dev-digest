import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow, RepoRow } from '../../db/rows.js';

/**
 * F1 — pulls data-access layer. The ONLY place in this module that touches
 * `pull_requests`, `pr_files`, `pr_commits`, and the read-side of
 * `agent_runs` / `reviews` / `findings`.
 *
 * Reads that feed the PR list return FLAT ROWS, deliberately: the
 * supersede-by-latest-run folds live in `helpers.ts` as pure functions over
 * these rows, so the ordering contract (`ranAt DESC` → first seen wins) is
 * expressed once here and consumed by logic that unit-tests without a DB.
 */

export type { PullRow };

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
  openedAt: Date | null;
  updatedAt: Date | null;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  filesCount: number;
}

/** One `findings` row joined out to its run + review — see `foldFindingsByPr`. */
export interface RunFindingRow {
  prId: string | null;
  agentId: string | null;
  runId: string;
  reviewId: string | null;
  severity: string | null;
}

/** One `agent_runs` cost row — see `foldCostByPr`. */
export interface RunCostRow {
  prId: string | null;
  agentId: string | null;
  costUsd: number | null;
}

export interface OrphanFindingRow {
  prId: string;
  severity: string | null;
}

export interface PrFileRow {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface PrCommitRow {
  sha: string;
  message: string;
  author: string;
  committedAt: Date | null;
}

export class PullsRepository {
  constructor(private db: Db) {}

  /** Tenancy-scoped repo lookup (the PR list is addressed by repo id). */
  async findRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Repo behind a PR — unscoped, the caller has already scoped the PR itself. */
  async findRepoById(repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return row;
  }

  async findPull(workspaceId: string, id: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, id)));
    return row;
  }

  async listByRepo(repoId: string): Promise<PullRow[]> {
    return this.db.select().from(t.pullRequests).where(eq(t.pullRequests.repoId, repoId));
  }

  /** Idempotent import — unique on (repo_id, number). */
  async upsert(values: UpsertPull): Promise<void> {
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

  async updateDiffStats(prId: string, stats: DiffStats): Promise<void> {
    await this.db.update(t.pullRequests).set(stats).where(eq(t.pullRequests.id, prId));
  }

  /** Latest review score per PR — newest-first, caller keeps the first per PR. */
  async listReviewScores(prIds: string[]): Promise<{ prId: string; score: number | null }[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ prId: t.reviews.prId, score: t.reviews.score })
      .from(t.reviews)
      .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
      .orderBy(desc(t.reviews.createdAt));
  }

  /**
   * Run costs, newest-first. Unpriced rows are NOT filtered in SQL: a failed
   * newest run has to stay visible so it can win its (pr, agent) slot and
   * suppress its predecessor. See `foldCostByPr`.
   */
  async listRunCosts(prIds: string[]): Promise<RunCostRow[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({
        prId: t.agentRuns.prId,
        agentId: t.agentRuns.agentId,
        costUsd: t.agentRuns.costUsd,
      })
      .from(t.agentRuns)
      .where(inArray(t.agentRuns.prId, prIds))
      .orderBy(desc(t.agentRuns.ranAt));
  }

  /**
   * Findings keyed on RUNS (not reviews), newest-first. The LEFT JOINs each
   * preserve a distinct "reviewed, and clean" case: runs→reviews lets a run be
   * seen even when its review has not landed, reviews→findings keeps a review
   * that found nothing. See `foldFindingsByPr`.
   */
  async listRunFindings(prIds: string[]): Promise<RunFindingRow[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({
        prId: t.agentRuns.prId,
        agentId: t.agentRuns.agentId,
        runId: t.agentRuns.id,
        reviewId: t.reviews.id,
        severity: t.findings.severity,
      })
      .from(t.agentRuns)
      .leftJoin(t.reviews, eq(t.reviews.runId, t.agentRuns.id))
      .leftJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(inArray(t.agentRuns.prId, prIds))
      .orderBy(desc(t.agentRuns.ranAt));
  }

  /**
   * Reviews with NO run behind them (the seeded demo review, or a review whose
   * run row was deleted). Nothing can supersede them, so they always count.
   */
  async listOrphanFindings(prIds: string[]): Promise<OrphanFindingRow[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({ prId: t.reviews.prId, severity: t.findings.severity })
      .from(t.reviews)
      .leftJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(and(inArray(t.reviews.prId, prIds), isNull(t.reviews.runId)));
  }

  async listFiles(prId: string): Promise<PrFileRow[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  async listCommits(prId: string): Promise<PrCommitRow[]> {
    return this.db
      .select({
        sha: t.prCommits.sha,
        message: t.prCommits.message,
        author: t.prCommits.author,
        committedAt: t.prCommits.committedAt,
      })
      .from(t.prCommits)
      .where(eq(t.prCommits.prId, prId));
  }

  /**
   * Replace the persisted detail for one PR: files, commits, body and diff
   * stats, in ONE transaction.
   *
   * Atomicity matters here specifically because each replace is a
   * delete-then-insert: a failure between the two used to leave a PR with no
   * files at all, turning a transient GitHub hiccup into data loss.
   */
  async replaceDetail(
    prId: string,
    detail: {
      files: PrFileRow[];
      commits: PrCommitRow[];
      body: string | null;
      stats: DiffStats;
    },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
      if (detail.files.length > 0) {
        await tx.insert(t.prFiles).values(
          detail.files.map((f) => ({
            prId,
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch,
          })),
        );
      }
      await tx.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
      if (detail.commits.length > 0) {
        await tx.insert(t.prCommits).values(
          detail.commits.map((c) => ({
            prId,
            sha: c.sha,
            message: c.message,
            author: c.author,
            committedAt: c.committedAt,
          })),
        );
      }
      await tx
        .update(t.pullRequests)
        .set({ body: detail.body, ...detail.stats })
        .where(eq(t.pullRequests.id, prId));
    });
  }
}
