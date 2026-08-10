import type { PrDetail, PrMeta } from '@devdigest/shared';
import type { PullRow } from '../../db/rows.js';
import type {
  OrphanFindingRow,
  PrCommitRow,
  PrFileRow,
  RunCostRow,
  RunFindingRow,
} from './repository.js';
import { deriveReviewStatus, findingsBySeverity } from './status.js';

/**
 * F1 — pulls pure transforms. No DB, no `this`, no I/O: every function here is
 * a fold over rows the repository already fetched, so the PR-list rollup rules
 * unit-test without Postgres.
 *
 * All three folds share one contract with the repository: rows arrive
 * NEWEST-FIRST (`ranAt DESC` / `createdAt DESC`), so the first row seen for a
 * key is the current one and everything after it is superseded.
 */

/** Diff stats are absent from GitHub's PR-list payload — these land zeroed. */
export function needsDiffStatBackfill(row: PullRow): boolean {
  return row.additions === 0 && row.deletions === 0 && row.filesCount === 0;
}

/** Latest review score per PR. First row per PR wins (newest-first). */
export function foldLatestScoreByPr(
  rows: { prId: string; score: number | null }[],
): Map<string, number | null> {
  const byPr = new Map<string, number | null>();
  for (const rv of rows) {
    if (!byPr.has(rv.prId)) byPr.set(rv.prId, rv.score);
  }
  return byPr;
}

/**
 * TOTAL COST per PR: the sum of each agent's LATEST run. Reviewing a PR with
 * three agents costs three runs, so the column has to answer "what did this PR
 * cost me", not "what did the last agent cost" — those differ by 3-5x. Summing
 * every run ever would instead keep growing across re-runs and never match a
 * single review, so older attempts by the SAME agent are superseded rather than
 * added.
 *
 * An agent whose LATEST run has no price contributes NOTHING — it does not fall
 * through to that agent's older priced run. A superseded run describes a review
 * that no longer exists, and quietly resurrecting its figure makes the column
 * describe a mix of the current attempt and an abandoned one.
 *
 * A missing key still means "no priced run", never "free" — free models
 * legitimately store 0, so the key is only created on a real contribution.
 */
export function foldCostByPr(rows: RunCostRow[]): Map<string, number> {
  const costByPr = new Map<string, number>();
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.prId) continue;
    // Deleted agents leave agent_id NULL (ON DELETE SET NULL) and are
    // indistinguishable from each other, so they share ONE bucket — that
    // undercounts an orphaned batch, but never double-counts one agent's retries.
    const key = `${r.prId}:${r.agentId ?? 'orphaned'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Slot taken either way: an unpriced latest run suppresses this agent's
    // older runs instead of deferring to them.
    if (r.costUsd == null) continue;
    costByPr.set(r.prId, (costByPr.get(r.prId) ?? 0) + r.costUsd);
  }
  return costByPr;
}

/**
 * FINDINGS per severity: the tally over each agent's LATEST RUN, keyed on
 * agent_runs rather than on reviews, and matching `foldCostByPr` above.
 *
 * Keying on runs is what makes a dead newest run suppress its predecessor.
 * insertReview only runs on the success path (reviews/run-executor.ts), so a
 * failed / cancelled / still-running run writes NO reviews row at all — a
 * reviews-keyed query cannot see that the agent has been re-run and silently
 * reports the older attempt's findings as if they were current. A `running` run
 * therefore also contributes nothing until it settles: mid-review the column
 * goes quiet instead of asserting a stale picture.
 *
 * A map entry is created only once a REVIEW is seen, never merely a run.
 * Presence of the entry is what makes the value non-null, and a PR whose runs
 * all failed has never been reviewed: it must read `—`, not a clean check.
 */
export function foldFindingsByPr(
  runRows: RunFindingRow[],
  orphanRows: OrphanFindingRow[],
): Map<string, { severity: string }[]> {
  const findingsByPr = new Map<string, { severity: string }[]>();
  const keptRunIds = new Set<string>();
  const seenAgents = new Set<string>();
  for (const row of runRows) {
    if (!row.prId) continue;
    const agentKey = `${row.prId}:${row.agentId ?? 'orphaned'}`;
    if (!seenAgents.has(agentKey)) {
      seenAgents.add(agentKey);
      keptRunIds.add(row.runId);
    }
    if (!keptRunIds.has(row.runId)) continue;
    // Gate on the REVIEW, not the run: a failed / cancelled / running run has
    // no review, so it must not make the PR look reviewed. A kept run WITH a
    // review and no findings is the genuine "reviewed, and clean" → {0,0,0}.
    if (row.reviewId == null) continue;
    if (!findingsByPr.has(row.prId)) findingsByPr.set(row.prId, []);
    if (row.severity != null) {
      findingsByPr.get(row.prId)!.push({ severity: row.severity });
    }
  }

  // Reviews with no run behind them always count — there is no newer run by
  // "their" agent to win the slot. Without this the seeded PR would report
  // {0,0,0} and its visible findings would vanish from the column.
  for (const row of orphanRows) {
    if (!findingsByPr.has(row.prId)) findingsByPr.set(row.prId, []);
    if (row.severity != null) findingsByPr.get(row.prId)!.push({ severity: row.severity });
  }
  return findingsByPr;
}

/** Row + rollups → the `PrMeta` transport shape. */
export function toPrMeta(
  row: PullRow,
  rollups: {
    score: number | null | undefined;
    hasReview: boolean;
    costUsd: number | undefined;
    findings: { severity: string }[] | undefined;
    now: number;
  },
): PrMeta {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    author: row.author,
    branch: row.branch,
    base: row.base,
    head_sha: row.headSha,
    additions: row.additions,
    deletions: row.deletions,
    files_count: row.filesCount,
    status: deriveReviewStatus({
      ghStatus: row.status,
      lastReviewedSha: row.lastReviewedSha,
      headSha: row.headSha,
      updatedAt: row.updatedAt,
      now: rollups.now,
    }),
    opened_at: row.openedAt?.toISOString() ?? null,
    updated_at: row.updatedAt?.toISOString() ?? null,
    score: rollups.hasReview ? (rollups.score ?? null) : null,
    cost_usd: rollups.costUsd ?? null,
    // null = never reviewed; {0,0,0} = reviewed and clean. Not the same thing.
    findings_by_severity: rollups.findings ? findingsBySeverity(rollups.findings) : null,
  };
}

/** Persisted rows → `PrDetail`, for the offline / no-token path. */
export function toPrDetail(
  row: PullRow,
  files: PrFileRow[],
  commits: PrCommitRow[],
): PrDetail {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    author: row.author,
    branch: row.branch,
    base: row.base,
    head_sha: row.headSha,
    additions: row.additions,
    deletions: row.deletions,
    files_count: row.filesCount,
    status: row.status as PrDetail['status'],
    opened_at: row.openedAt?.toISOString() ?? null,
    updated_at: row.updatedAt?.toISOString() ?? null,
    body: row.body ?? null,
    files: files.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    })),
    commits: commits.map((c) => ({
      sha: c.sha,
      message: c.message,
      author: c.author,
      committed_at: c.committedAt?.toISOString() ?? null,
    })),
  };
}
