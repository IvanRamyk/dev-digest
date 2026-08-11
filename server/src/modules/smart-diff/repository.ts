import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow } from '../../db/rows.js';
import type {
  FileRow,
  OrphanFindingLocationRow,
  RunFindingLocationRow,
} from './helpers.js';

/**
 * Smart Diff data-access layer — the module's ONLY drizzle site.
 *
 * This module reads three tables it does not own — `pr_files` (pulls' table) and
 * `agent_runs` / `reviews` / `findings` (reviews' tables). That mirrors the
 * precedent the conventions module set and documented (`server/INSIGHTS.md`
 * 2026-08-08): a module needing another module's raw rows queries them from its
 * own `repository.ts` rather than bloating the sibling's facade. We deliberately
 * do NOT import `PullsRepository` — the trade-off is written up in
 * `specs/smart-diff.md` → Consequences.
 *
 * `listRunFindingLocations` returns rows NEWEST-FIRST (`ran_at DESC`); the
 * latest-run fold in `helpers.ts:currentFindingRows` depends on that contract,
 * stated once here (as `pulls/repository.ts:9-15` does).
 */
export class SmartDiffRepository {
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
   * The PR's changed files — path + churn only, NOT the patch text. The client
   * already holds the diff from `GET /pulls/:id`, so re-shipping it here would
   * double the payload for no gain.
   */
  async listFiles(prId: string): Promise<FileRow[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  /**
   * Finding locations keyed on RUNS (not reviews), NEWEST-FIRST. The LEFT JOINs
   * each preserve a distinct case: runs→reviews lets a run be seen even when its
   * review has not landed, reviews→findings keeps a review that found nothing.
   * The fold uses the `ran_at DESC` order to pick each agent's latest run.
   */
  async listRunFindingLocations(prId: string): Promise<RunFindingLocationRow[]> {
    return this.db
      .select({
        agentId: t.agentRuns.agentId,
        runId: t.agentRuns.id,
        reviewId: t.reviews.id,
        file: t.findings.file,
        startLine: t.findings.startLine,
        endLine: t.findings.endLine,
        severity: t.findings.severity,
      })
      .from(t.agentRuns)
      .leftJoin(t.reviews, eq(t.reviews.runId, t.agentRuns.id))
      .leftJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(eq(t.agentRuns.prId, prId))
      .orderBy(desc(t.agentRuns.ranAt));
  }

  /**
   * Findings on reviews with NO run behind them (the seeded demo review, or a
   * review whose run row was deleted). Cannot be folded into the run query: a
   * LEFT JOIN *from* `agent_runs` can never reach a run-less review. Nothing can
   * supersede these, so they always count.
   */
  async listOrphanFindingLocations(prId: string): Promise<OrphanFindingLocationRow[]> {
    return this.db
      .select({
        file: t.findings.file,
        startLine: t.findings.startLine,
        endLine: t.findings.endLine,
        severity: t.findings.severity,
      })
      .from(t.reviews)
      .leftJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.reviews.prId, prId), isNull(t.reviews.runId)));
  }
}
