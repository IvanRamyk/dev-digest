/**
 * PR-list rollup FOLDS (`modules/pulls/helpers.ts`) — the supersede-by-latest-run
 * rules that decide each PR's cost and findings.
 *
 * These rules used to live inline in the route handler and could only be reached
 * through Postgres + a mock GitHub (`reviews.it.test.ts` still covers them
 * end-to-end). They are pure folds over already-fetched rows, so the edge cases
 * that matter — an unpriced newest run, a run with no review, a review with no
 * run — get direct coverage here without a container.
 *
 * Shared contract with the repository: rows arrive NEWEST-FIRST, so the first
 * row seen for a (pr, agent) key is current and the rest are superseded.
 */
import { describe, it, expect } from 'vitest';
import {
  foldCostByPr,
  foldFindingsByPr,
  foldLatestScoreByPr,
  needsDiffStatBackfill,
} from '../src/modules/pulls/helpers.js';
import type { PullRow } from '../src/db/rows.js';
import type { OrphanFindingRow, RunFindingRow } from '../src/modules/pulls/repository.js';

describe('foldLatestScoreByPr', () => {
  it('keeps the first row per PR (newest-first) and ignores older reviews', () => {
    const byPr = foldLatestScoreByPr([
      { prId: 'p1', score: 90 },
      { prId: 'p1', score: 10 },
      { prId: 'p2', score: null },
    ]);
    expect(byPr.get('p1')).toBe(90);
    // Present-but-null is "reviewed, no score" — distinct from absent.
    expect(byPr.get('p2')).toBeNull();
    expect(byPr.has('p3')).toBe(false);
  });
});

describe('foldCostByPr', () => {
  it("sums each agent's latest run and supersedes that agent's earlier runs", () => {
    const byPr = foldCostByPr([
      { prId: 'p1', agentId: 'a1', costUsd: 0.5 },
      { prId: 'p1', agentId: 'a1', costUsd: 9.9 }, // superseded
      { prId: 'p1', agentId: 'a2', costUsd: 0.25 },
    ]);
    expect(byPr.get('p1')).toBeCloseTo(0.75);
  });

  it('lets an unpriced newest run suppress its predecessor rather than defer to it', () => {
    const byPr = foldCostByPr([
      { prId: 'p1', agentId: 'a1', costUsd: null },
      { prId: 'p1', agentId: 'a1', costUsd: 9.9 }, // must NOT resurrect
    ]);
    // No priced contribution at all → absent, which the caller renders as null.
    expect(byPr.has('p1')).toBe(false);
  });

  it('distinguishes a free model (0) from no priced run (absent)', () => {
    const byPr = foldCostByPr([{ prId: 'p1', agentId: 'a1', costUsd: 0 }]);
    expect(byPr.get('p1')).toBe(0);
    expect(byPr.has('p2')).toBe(false);
  });

  it('buckets every deleted agent together instead of double-counting retries', () => {
    const byPr = foldCostByPr([
      { prId: 'p1', agentId: null, costUsd: 1 },
      { prId: 'p1', agentId: null, costUsd: 2 }, // same 'orphaned' slot
    ]);
    expect(byPr.get('p1')).toBe(1);
  });

  it('skips rows with no prId', () => {
    expect(foldCostByPr([{ prId: null, agentId: 'a1', costUsd: 1 }]).size).toBe(0);
  });
});

const run = (o: Partial<RunFindingRow> & { runId: string }): RunFindingRow => ({
  prId: 'p1',
  agentId: 'a1',
  reviewId: 'rv1',
  severity: null,
  ...o,
});

describe('foldFindingsByPr', () => {
  it("tallies each agent's latest run and supersedes the earlier one", () => {
    const byPr = foldFindingsByPr(
      [
        run({ runId: 'r2', severity: 'CRITICAL' }),
        run({ runId: 'r1', reviewId: 'rv0', severity: 'WARNING' }), // superseded
      ],
      [],
    );
    expect(byPr.get('p1')).toEqual([{ severity: 'CRITICAL' }]);
  });

  it('drops an agent whose newest run produced no review, without resurrecting older findings', () => {
    const byPr = foldFindingsByPr(
      [
        run({ runId: 'r2', reviewId: null }), // failed / cancelled / running
        run({ runId: 'r1', reviewId: 'rv0', severity: 'CRITICAL' }),
      ],
      [],
    );
    // Never reviewed at the current attempt → absent, rendered as "—", not {0,0,0}.
    expect(byPr.has('p1')).toBe(false);
  });

  it('records reviewed-and-clean as an empty array, distinct from never-reviewed', () => {
    const byPr = foldFindingsByPr([run({ runId: 'r1', severity: null })], []);
    expect(byPr.get('p1')).toEqual([]);
    expect(byPr.has('p2')).toBe(false);
  });

  it('always counts a review with no run behind it', () => {
    const orphans: OrphanFindingRow[] = [{ prId: 'p9', severity: 'SUGGESTION' }];
    const byPr = foldFindingsByPr([], orphans);
    expect(byPr.get('p9')).toEqual([{ severity: 'SUGGESTION' }]);
  });

  it('merges orphan findings into a PR that also has runs', () => {
    const byPr = foldFindingsByPr(
      [run({ runId: 'r1', severity: 'CRITICAL' })],
      [{ prId: 'p1', severity: 'WARNING' }],
    );
    expect(byPr.get('p1')).toEqual([{ severity: 'CRITICAL' }, { severity: 'WARNING' }]);
  });
});

describe('needsDiffStatBackfill', () => {
  const row = (o: Partial<PullRow>) =>
    ({ additions: 0, deletions: 0, filesCount: 0, ...o }) as PullRow;

  it('flags a freshly-imported PR with zeroed stats', () => {
    expect(needsDiffStatBackfill(row({}))).toBe(true);
  });

  it('leaves a PR with any real stat alone', () => {
    expect(needsDiffStatBackfill(row({ additions: 3 }))).toBe(false);
    expect(needsDiffStatBackfill(row({ filesCount: 1 }))).toBe(false);
  });
});
