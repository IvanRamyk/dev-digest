/**
 * `latestPerAgentRuns` is the rule that stops a dead re-run from resurrecting the
 * findings it superseded. A failed/cancelled/running run writes no `reviews` row,
 * so keying on RUNS (not reviews) is what lets the dead newest run take the
 * agent's slot and suppress its own predecessor. Mirrors the server's
 * findings_by_severity.
 */
import { describe, it, expect } from "vitest";
import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import { latestPerAgentRuns } from "./reviews";

function review(id: string, runId: string | null): ReviewRecord {
  return { id, run_id: runId, findings: [] } as unknown as ReviewRecord;
}
function run(runId: string, agentId: string | null, ranAt: string | null): RunSummary {
  return { run_id: runId, agent_id: agentId, ran_at: ranAt, status: "done" } as RunSummary;
}

describe("latestPerAgentRuns", () => {
  it("keeps only the review from each agent's newest run", () => {
    const kept = latestPerAgentRuns(
      [review("old", "r1"), review("new", "r2")],
      [run("r1", "a1", "2026-08-01T00:00:00Z"), run("r2", "a1", "2026-08-05T00:00:00Z")],
    );
    expect(kept.map((r) => r.id)).toEqual(["new"]);
  });

  it("suppresses a superseded review when the newest run produced none", () => {
    // r2 is newer and died, so it wrote no review — the old findings must NOT
    // come back, which is the whole point of keying on runs.
    const kept = latestPerAgentRuns(
      [review("old", "r1")],
      [run("r1", "a1", "2026-08-01T00:00:00Z"), run("r2", "a1", "2026-08-05T00:00:00Z")],
    );
    expect(kept).toEqual([]);
  });

  it("keeps one review per agent, independently", () => {
    const kept = latestPerAgentRuns(
      [review("a1-new", "r2"), review("a2-only", "r3")],
      [
        run("r1", "a1", "2026-08-01T00:00:00Z"),
        run("r2", "a1", "2026-08-05T00:00:00Z"),
        run("r3", "a2", "2026-08-02T00:00:00Z"),
      ],
    );
    expect(kept.map((r) => r.id).sort()).toEqual(["a1-new", "a2-only"]);
  });

  it("always keeps a runless review — nothing can supersede it", () => {
    const kept = latestPerAgentRuns(
      [review("seeded", null), review("old", "r1")],
      [run("r1", "a1", "2026-08-01T00:00:00Z"), run("r2", "a1", "2026-08-05T00:00:00Z")],
    );
    expect(kept.map((r) => r.id)).toEqual(["seeded"]);
  });

  it("does not trust input order — it sorts by ran_at itself", () => {
    const kept = latestPerAgentRuns(
      [review("old", "r1"), review("new", "r2")],
      // newest first this time
      [run("r2", "a1", "2026-08-05T00:00:00Z"), run("r1", "a1", "2026-08-01T00:00:00Z")],
    );
    expect(kept.map((r) => r.id)).toEqual(["new"]);
  });

  it("groups runs with no agent_id under one 'orphaned' slot", () => {
    const kept = latestPerAgentRuns(
      [review("older", "r1"), review("newer", "r2")],
      [run("r1", null, "2026-08-01T00:00:00Z"), run("r2", null, "2026-08-05T00:00:00Z")],
    );
    expect(kept.map((r) => r.id)).toEqual(["newer"]);
  });

  it("returns nothing when there are no reviews", () => {
    expect(latestPerAgentRuns([], [run("r1", "a1", "2026-08-01T00:00:00Z")])).toEqual([]);
  });
});
