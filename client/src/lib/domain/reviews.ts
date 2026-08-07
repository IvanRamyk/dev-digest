/* domain/reviews.ts — which reviews describe a PR's CURRENT state. Pure.

   This is a server-mirroring rule, which is why it lives in the domain tier
   rather than next to any one component (C12). */

import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import { tsOf } from "./time";

/**
 * The reviews that describe the CURRENT state of a PR: for each agent, the review
 * produced by that agent's latest RUN — and nothing at all when that run produced
 * no review.
 *
 * Why runs and not reviews: a failed, cancelled, or still-running run writes no
 * `reviews` row (`insertReview` sits on the success path only), so a reviews-only
 * rule cannot tell "this agent was re-run and it died" from "this agent was never
 * re-run", and resurrects the superseded review's findings. Keying on runs lets
 * the dead newest run take the agent's slot and suppress its own predecessor.
 * Mirrors the server's `findings_by_severity`
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
