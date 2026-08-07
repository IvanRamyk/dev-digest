import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

const CRITICAL: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A secret is committed.",
  suggestion: null,
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

/** A WARNING the `hide low confidence` toggle also drops (confidence < 0.65),
    so severity + confidence filtering can be shown to compose. */
const WARNING_LOW_CONF: FindingRecord = {
  ...CRITICAL,
  id: "f2",
  severity: "WARNING",
  category: "perf",
  title: "N+1 query in user list",
  file: "src/api/users.ts",
  start_line: 45,
  end_line: 52,
  rationale: "The loop queries once per user.",
  confidence: 0.4,
};

const FINDINGS: FindingRecord[] = [CRITICAL, WARNING_LOW_CONF];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" repoId="repo1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" repoId="repo1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel severity filter", () => {
  it("counts this run's own findings in the toolbar", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" repoId="repo1" />);
    expect(screen.getByRole("button", { name: /Critical/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Warning/ })).toBeInTheDocument();
    // No SUGGESTION in this run, so no chip for it.
    expect(screen.queryByRole("button", { name: /Suggestion/ })).not.toBeInTheDocument();
  });

  it("shows only the picked severity, and restores everything when toggled off", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" repoId="repo1" />);
    fireEvent.click(screen.getByRole("button", { name: /Critical/ }));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.queryByText("N+1 query in user list")).not.toBeInTheDocument();

    // Single-select toggle: the same chip again clears the filter.
    fireEvent.click(screen.getByRole("button", { name: /Critical/ }));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list")).toBeInTheDocument();
  });

  it("keeps the counters intact while the list is filtered — they describe the run", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" repoId="repo1" />);
    fireEvent.click(screen.getByRole("button", { name: /Critical/ }));
    expect(screen.getByRole("button", { name: /Warning/ })).toBeInTheDocument();
  });

  it("composes with hide-low-confidence as an AND", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" repoId="repo1" />);
    // The only WARNING is low-confidence, so both cuts together empty the list.
    fireEvent.click(screen.getByRole("button", { name: /Warning/ }));
    expect(screen.getByText("N+1 query in user list")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByText("N+1 query in user list")).not.toBeInTheDocument();
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});
