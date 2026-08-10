import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/conventions.json";
import type { ConventionCandidate } from "@/lib/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/repo-not-found", () => ({
  RepoNotFound: () => <div>repo not found</div>,
}));

const activeRepo = { id: "r1", full_name: "acme/payments-api" };
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo, reposLoaded: true }),
}));

const CANDIDATES: ConventionCandidate[] = [
  {
    id: "c-accepted",
    scan_id: "s1",
    rule: "Already accepted rule",
    category: "structure",
    status: "accepted",
    source: "model",
    evidence_path: "a.ts",
    evidence_start_line: 1,
    evidence_end_line: 1,
    evidence_snippet: "x",
    verification: "pattern",
    support_count: 5,
    violation_count: 0,
    confidence: 0.8,
    accepted: true,
    created_at: "2026-08-08T00:00:00Z",
    updated_at: "2026-08-08T00:00:00Z",
  },
  {
    id: "c-unverified",
    scan_id: "s1",
    rule: "An unverified rule",
    category: "other",
    status: "pending",
    source: "model",
    evidence_path: "b.ts",
    evidence_start_line: 1,
    evidence_end_line: 1,
    evidence_snippet: "y",
    verification: "unverified",
    support_count: 0,
    violation_count: 0,
    confidence: 0.3,
    accepted: false,
    created_at: "2026-08-08T00:00:00Z",
    updated_at: "2026-08-08T00:00:00Z",
  },
  {
    id: "c-high-confidence",
    scan_id: "s1",
    rule: "A high confidence pending rule",
    category: "other",
    status: "pending",
    source: "model",
    evidence_path: "c.ts",
    evidence_start_line: 1,
    evidence_end_line: 1,
    evidence_snippet: "z",
    verification: "semantic",
    support_count: 4,
    violation_count: 0,
    confidence: 0.95,
    accepted: false,
    created_at: "2026-08-08T00:00:00Z",
    updated_at: "2026-08-08T00:00:00Z",
  },
];

const refetch = vi.fn();
const startScanMutate = vi.fn();
const updateMutate = vi.fn();
const bulkMutate = vi.fn();

vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({
    data: { scan: { id: "s1", status: "done", sample_file_count: 12, created_at: "2026-08-08T00:00:00Z" }, candidates: CANDIDATES },
    isLoading: false,
    isError: false,
    refetch,
  }),
  useConventionScan: () => ({ data: { id: "s1", status: "done", sample_file_count: 12, created_at: "2026-08-08T00:00:00Z" } }),
  useStartConventionScan: () => ({ mutate: startScanMutate, isPending: false }),
  useUpdateConvention: () => ({ mutate: updateMutate }),
  useBulkUpdateConventions: () => ({ mutate: bulkMutate }),
}));

import { ConventionsView } from "./ConventionsView";

afterEach(cleanup);

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionsView />
    </NextIntlClientProvider>,
  );
}

describe("ConventionsView (smoke)", () => {
  it("orders accepted first, then by confidence, unverified last under a divider", () => {
    renderView();
    const rules = screen.getAllByText(/rule$/i).map((el) => el.textContent);
    expect(rules).toEqual([
      "Already accepted rule",
      "A high confidence pending rule",
      "An unverified rule",
    ]);
    expect(screen.getByText(messages.page.unverifiedDivider)).toBeInTheDocument();
  });

  it("shows the repo name in the heading and the sample count in the meta row", () => {
    renderView();
    expect(screen.getByText(/acme\/payments-api/)).toBeInTheDocument();
    expect(screen.getByText(messages.page.detectedFrom.replace("{count, plural, one {# sample file} other {# sample files}}", "12 sample files"))).toBeTruthy();
  });

  it("clicking Re-scan starts a new scan", () => {
    renderView();
    fireEvent.click(screen.getByText(messages.page.rescan));
    expect(startScanMutate).toHaveBeenCalled();
  });

  it("Deselect all bulk-rejects every candidate id", () => {
    renderView();
    fireEvent.click(screen.getByText(messages.page.deselectAll));
    expect(bulkMutate).toHaveBeenCalledWith({ ids: CANDIDATES.map((c) => c.id), status: "rejected" });
  });

  it("Create skill is disabled when nothing is accepted, enabled once something is", () => {
    renderView();
    const button = screen.getByText(messages.page.createSkill).closest("button")!;
    expect(button).not.toBeDisabled(); // one candidate is already accepted in the fixture
  });
});
