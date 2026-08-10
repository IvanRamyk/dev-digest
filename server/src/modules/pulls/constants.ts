/**
 * Diff-stat backfills per list request. Each one is a separate PR-detail fetch,
 * so the work is capped rather than unbounded; the periodic refetch chips away
 * at any remainder.
 */
export const DIFF_STAT_BACKFILL_LIMIT = 10;
