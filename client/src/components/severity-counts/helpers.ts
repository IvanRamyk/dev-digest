/** Severity tallying + the latest-review-per-agent rule. Shared by every surface
    that counts findings, so the PR list, the timeline, and a run's toolbar never
    disagree about the same set of findings. */

import type { FindingsBySeverity, ReviewRecord, RunSummary } from "@devdigest/shared";

/**
 * Count findings per severity.
 *
 * Mirrors the server's `findingsBySeverity` (`modules/pulls/status.ts`): anything
 * outside the three known values is DROPPED, never bucketed. `findings.severity`
 * is free-form text with no CHECK constraint, so a model that emits "HIGH" stores
 * "HIGH" — and a fourth bucket has no colour, no icon, and no contract.
 *
 * An empty input is `{0,0,0}` — "reviewed, and clean". "Never reviewed" is `null`
 * and is the caller's job to represent.
 */
export function severityTally(findings: { severity: string }[]): FindingsBySeverity {
  const counts: FindingsBySeverity = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity === "CRITICAL") counts.CRITICAL += 1;
    else if (f.severity === "WARNING") counts.WARNING += 1;
    else if (f.severity === "SUGGESTION") counts.SUGGESTION += 1;
  }
  return counts;
}

/** Total across the three buckets. `null`/`undefined` → 0. */
export function totalOf(counts: FindingsBySeverity | null | undefined): number {
  if (counts == null) return 0;
  return counts.CRITICAL + counts.WARNING + counts.SUGGESTION;
}

/**
 * The reviews that describe the CURRENT state of a PR: for each agent, the review
 * produced by that agent's latest RUN — and nothing at all when that run produced
 * no review.
 *
 * Why runs and not reviews: a failed, cancelled, or still-running run writes no
 * `reviews` row (`insertReview` sits on the success path only), so a
 * reviews-only rule cannot tell "this agent was re-run and it died" from "this
 * agent was never re-run", and resurrects the superseded review's findings.
 * Keying on runs lets the dead newest run take the agent's slot and suppress its
 * own predecessor. Mirrors the server's `findings_by_severity`
 * (`server/src/modules/pulls/routes.ts`).
 *
 * A review with `run_id === null` — the seeded demo review, or one whose run row
 * was deleted — has no run that could supersede it and is always kept.
 */
export function latestPerAgentRuns(
  reviews: ReviewRecord[],
  runs: RunSummary[],
): ReviewRecord[] {
  // Reviews with no run are exempt from superseding entirely.
  const runless = reviews.filter((r) => r.run_id == null);

  // Newest run per agent. Sort defensively rather than trusting input order:
  // usePrRuns and usePrReviews are separate queries, and only the latter is
  // documented as newest-first.
  const byRanAtDesc = [...runs].sort((a, b) => tsOf(b.ran_at) - tsOf(a.ran_at));
  const latestRunIds = new Set<string>();
  const seenAgents = new Set<string>();
  for (const run of byRanAtDesc) {
    const key = run.agent_id ?? "orphaned";
    if (seenAgents.has(key)) continue;
    seenAgents.add(key);
    latestRunIds.add(run.run_id);
  }

  const current = reviews.filter((r) => r.run_id != null && latestRunIds.has(r.run_id));
  return [...current, ...runless];
}

/** Epoch ms for sorting; missing/unparseable timestamps sort last. */
function tsOf(iso: string | null | undefined): number {
  if (!iso) return 0;
  const n = Date.parse(iso);
  return Number.isNaN(n) ? 0 : n;
}
