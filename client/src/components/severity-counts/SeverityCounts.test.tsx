/**
 * SeverityCounts guards the two distinctions the feature exists for:
 *  - `null` (never reviewed) must not render like `{0,0,0}` (reviewed and clean),
 *    or a clean PR looks like one nobody has looked at;
 *  - an unknown severity must be dropped, not bucketed — `findings.severity` is
 *    free-form text with no CHECK constraint, and a fourth bucket has no contract.
 * Plus the toggle semantics: clicking the active severity clears the filter.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";
import { SeverityCounts } from "./SeverityCounts";
import { severityTally, totalOf, latestPerAgentRuns } from "./helpers";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("severityTally", () => {
  it("counts the three known buckets", () => {
    expect(
      severityTally([
        { severity: "CRITICAL" },
        { severity: "CRITICAL" },
        { severity: "WARNING" },
        { severity: "SUGGESTION" },
      ]),
    ).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
  });

  it("drops an unknown severity instead of creating a fourth bucket", () => {
    const counts = severityTally([{ severity: "HIGH" }, { severity: "WARNING" }]);
    expect(counts).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 0 });
    expect(Object.keys(counts)).toEqual(["CRITICAL", "WARNING", "SUGGESTION"]);
  });

  it("is all-zero for no findings, and totalOf treats null as 0", () => {
    expect(severityTally([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
    expect(totalOf(null)).toBe(0);
    expect(totalOf({ CRITICAL: 1, WARNING: 2, SUGGESTION: 3 })).toBe(6);
  });
});

describe("latestPerAgentRuns", () => {
  const review = (id: string, agentId: string | null, runId: string | null): ReviewRecord => ({
    id,
    pr_id: "p1",
    agent_id: agentId,
    run_id: runId,
    agent_name: agentId ?? "deleted",
    kind: "review",
    verdict: "comment",
    summary: null,
    score: 70,
    model: "gpt-4.1",
    created_at: "2026-06-11T00:00:00.000Z",
    findings: [],
  });

  const run = (runId: string, agentId: string | null, ranAt: string): RunSummary => ({
    run_id: runId,
    agent_id: agentId,
    agent_name: agentId ?? "deleted",
    provider: "openai",
    model: "gpt-4.1",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.001,
    findings_count: 0,
    grounding: null,
    ran_at: ranAt,
    score: 70,
    blockers: 0,
  });

  it("keeps the review from each agent's newest run and drops the superseded one", () => {
    const kept = latestPerAgentRuns(
      [
        review("rv-new-a", "agent-a", "run-new-a"),
        review("rv-old-a", "agent-a", "run-old-a"),
        review("rv-b", "agent-b", "run-b"),
      ],
      [
        run("run-new-a", "agent-a", "2026-06-11T12:00:00.000Z"),
        run("run-old-a", "agent-a", "2026-06-11T10:00:00.000Z"),
        run("run-b", "agent-b", "2026-06-11T10:00:00.000Z"),
      ],
    );
    expect(kept.map((r) => r.id).sort()).toEqual(["rv-b", "rv-new-a"]);
  });

  it("drops an agent entirely when its newest run produced no review", () => {
    // The failed/cancelled/running re-run writes no reviews row. Its own older
    // review must NOT come back — that is the whole point of keying on runs.
    const kept = latestPerAgentRuns(
      [review("rv-old-a", "agent-a", "run-old-a"), review("rv-b", "agent-b", "run-b")],
      [
        run("run-dead-a", "agent-a", "2026-06-11T12:00:00.000Z"), // newest, no review
        run("run-old-a", "agent-a", "2026-06-11T10:00:00.000Z"),
        run("run-b", "agent-b", "2026-06-11T10:00:00.000Z"),
      ],
    );
    expect(kept.map((r) => r.id)).toEqual(["rv-b"]);
  });

  it("always keeps a review with no run behind it (seed / deleted run row)", () => {
    // Nothing can supersede it: there is no newer run by "its" agent.
    const kept = latestPerAgentRuns(
      [review("rv-seed", null, null), review("rv-old-a", "agent-a", "run-old-a")],
      [run("run-dead-a", "agent-a", "2026-06-11T12:00:00.000Z")],
    );
    expect(kept.map((r) => r.id)).toEqual(["rv-seed"]);
  });

  it("collapses runs from deleted agents into one bucket", () => {
    // agent_id is NULL after the agent is deleted, so those runs are
    // indistinguishable: undercounting beats double-counting one agent's retries.
    const kept = latestPerAgentRuns(
      [review("rv-1", null, "run-1"), review("rv-2", null, "run-2")],
      [
        run("run-1", null, "2026-06-11T12:00:00.000Z"),
        run("run-2", null, "2026-06-11T10:00:00.000Z"),
      ],
    );
    expect(kept.map((r) => r.id)).toEqual(["rv-1"]);
  });

  it("does not depend on the order runs arrive in", () => {
    // usePrRuns and usePrReviews are separate queries; only the latter is
    // documented newest-first, so the helper sorts defensively.
    const runs = [
      run("run-old-a", "agent-a", "2026-06-11T10:00:00.000Z"),
      run("run-new-a", "agent-a", "2026-06-11T12:00:00.000Z"),
    ];
    const kept = latestPerAgentRuns(
      [review("rv-new-a", "agent-a", "run-new-a"), review("rv-old-a", "agent-a", "run-old-a")],
      runs,
    );
    expect(kept.map((r) => r.id)).toEqual(["rv-new-a"]);
  });

  it("returns nothing when there are no reviews at all", () => {
    expect(latestPerAgentRuns([], [run("run-a", "agent-a", "2026-06-11T12:00:00.000Z")])).toEqual(
      [],
    );
  });
});

describe("SeverityCounts — chips variant", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders one count per non-zero bucket in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <SeverityCounts counts={{ CRITICAL: 3, WARNING: 5, SUGGESTION: 0 }} />
        </div>,
      );
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
      // The zero bucket is omitted entirely, not rendered as "0".
      expect(screen.queryByText("0")).not.toBeInTheDocument();
      expect(screen.queryByText("—")).not.toBeInTheDocument();
    });
  });

  it("renders an em-dash when the PR was never reviewed", () => {
    renderWithIntl(<SeverityCounts counts={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders a clean marker — NOT an em-dash — for a reviewed PR with no findings", () => {
    renderWithIntl(<SeverityCounts counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} />);
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.getByTitle("Reviewed — no findings")).toBeInTheDocument();
  });

  it("renders no buttons — a PR row is one navigation target", () => {
    renderWithIntl(<SeverityCounts counts={{ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 }} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("SeverityCounts — counters variant", () => {
  it("renders a labelled toggle per non-zero bucket", () => {
    renderWithIntl(
      <SeverityCounts
        variant="counters"
        counts={{ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /Critical/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Warning/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Suggestion/ })).not.toBeInTheDocument();
  });

  it("selects a severity on click", () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <SeverityCounts
        variant="counters"
        counts={{ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 }}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Critical/ }));
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
  });

  it("clears the filter when the active severity is clicked again", () => {
    const onSelect = vi.fn();
    renderWithIntl(
      <SeverityCounts
        variant="counters"
        counts={{ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 }}
        active="CRITICAL"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Critical/ }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("renders nothing when there is nothing to filter", () => {
    const { container } = renderWithIntl(
      <SeverityCounts variant="counters" counts={{ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
