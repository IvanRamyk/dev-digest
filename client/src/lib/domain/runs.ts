/* domain/runs.ts — a run's outcome. Pure: returns a verdict, not a colour.

   The badge reflects the review OUTCOME, not just the run lifecycle: a finished
   run that found blockers reads "rejected", never a green "done". Outcome is
   derived from the denormalized blocker/finding counts on the run row, so it
   matches the CI gate (deterministic) rather than the model's verdict — which is
   why this mirrors the server and belongs here (C12).

   Colours and icons per outcome are presentation: see RunHistory/constants.ts. */

import type { RunSummary } from "@devdigest/shared";

export type RunOutcome =
  | "running"
  | "error"
  | "cancelled"
  | "rejected"
  | "reviewed"
  | "approved";

/** A run's outcome. Lifecycle states win; a settled run is judged by its counts. */
export function outcomeOf(run: RunSummary): RunOutcome {
  const status = run.status ?? "";
  if (status === "running") return "running";
  if (status === "failed") return "error";
  if (status === "cancelled") return "cancelled";
  // Settled ("done"): judge by the deterministic counts, not the model's verdict.
  if ((run.blockers ?? 0) > 0) return "rejected";
  if ((run.findings_count ?? 0) > 0) return "reviewed";
  return "approved";
}
