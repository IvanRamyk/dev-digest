/**
 * A run's outcome must match the CI gate, not the model's opinion: a finished run
 * that found blockers is "rejected", never a green "approved". Lifecycle states
 * (running/failed/cancelled) win over counts, so a dead run is never scored.
 */
import { describe, it, expect } from "vitest";
import type { RunSummary } from "@devdigest/shared";
import { outcomeOf } from "./runs";

function run(patch: Partial<RunSummary>): RunSummary {
  return {
    run_id: "r1",
    agent_id: "a1",
    agent_name: "General",
    status: "done",
    ran_at: "2026-08-06T10:00:00Z",
    ...patch,
  } as RunSummary;
}

describe("outcomeOf", () => {
  it("reports lifecycle states before looking at counts", () => {
    expect(outcomeOf(run({ status: "running", blockers: 3 }))).toBe("running");
    expect(outcomeOf(run({ status: "failed", blockers: 3 }))).toBe("error");
    expect(outcomeOf(run({ status: "cancelled", blockers: 3 }))).toBe("cancelled");
  });

  it("rejects a settled run that found blockers", () => {
    expect(outcomeOf(run({ status: "done", blockers: 1, findings_count: 4 }))).toBe("rejected");
  });

  it("marks a settled run with findings but no blockers as reviewed", () => {
    expect(outcomeOf(run({ status: "done", blockers: 0, findings_count: 2 }))).toBe("reviewed");
  });

  it("approves a settled, clean run", () => {
    expect(outcomeOf(run({ status: "done", blockers: 0, findings_count: 0 }))).toBe("approved");
  });

  it("treats missing counts as clean rather than throwing", () => {
    expect(outcomeOf(run({ status: "done", blockers: null, findings_count: null }))).toBe(
      "approved",
    );
  });
});
