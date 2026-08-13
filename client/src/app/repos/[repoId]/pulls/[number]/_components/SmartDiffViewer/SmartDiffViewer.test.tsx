import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, SmartDiff, FindingRecord } from "@devdigest/shared";
import prReview from "../../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../../messages/en/shell.json";
import { SmartDiffViewer } from "./SmartDiffViewer";

// jsdom does not implement scrollIntoView; the jump-to-finding gesture calls it.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const CORE_PATCH = "@@ -1,3 +1,4 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;";
const WIRING_PATCH = "@@ -1,1 +1,2 @@\n export {};\n+export const x = 1;";
const BOILER_PATCH = "@@ -1,1 +1,1 @@\n-old\n+new";

const files: PrFile[] = [
  { path: "src/service.ts", additions: 2, deletions: 1, patch: CORE_PATCH },
  { path: "src/index.ts", additions: 1, deletions: 0, patch: WIRING_PATCH },
  { path: "pnpm-lock.yaml", additions: 1, deletions: 1, patch: BOILER_PATCH },
];

/** A CRITICAL finding on the core file's new line 3, so a mark + badge appear. */
const finding: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "bug",
  title: "Off-by-one",
  file: "src/service.ts",
  start_line: 3,
  end_line: 3,
  rationale: "Loop overruns.",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

/** smartDiff with all three groups; the core file carries the finding line. */
function smartDiff(overrides: Partial<SmartDiff> = {}): SmartDiff {
  return {
    groups: [
      {
        role: "core",
        files: [
          {
            path: "src/service.ts",
            pseudocode_summary: null,
            additions: 2,
            deletions: 1,
            finding_lines: [3],
          },
        ],
      },
      {
        role: "wiring",
        files: [
          {
            path: "src/index.ts",
            pseudocode_summary: null,
            additions: 1,
            deletions: 0,
            finding_lines: [],
          },
        ],
      },
      {
        role: "boilerplate",
        files: [
          {
            path: "pnpm-lock.yaml",
            pseudocode_summary: null,
            additions: 1,
            deletions: 1,
            finding_lines: [],
          },
        ],
      },
    ],
    split_suggestion: { too_big: false, total_lines: 6, proposed_splits: [] },
    ...overrides,
  };
}

function renderViewer(sd: SmartDiff, findings: FindingRecord[] = []) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
      <SmartDiffViewer smartDiff={sd} files={files} findings={findings} />
    </NextIntlClientProvider>,
  );
}

describe("SmartDiffViewer", () => {
  it("renders the three role sections with captions and per-group summaries", () => {
    renderViewer(smartDiff());

    expect(screen.getByText("Core logic")).toBeInTheDocument();
    expect(screen.getByText("Wiring")).toBeInTheDocument();
    expect(screen.getByText("Boilerplate")).toBeInTheDocument();

    // Captions come from prReview.smartDiff.*Caption.
    expect(
      screen.getByText("The substance of the change — review this first"),
    ).toBeInTheDocument();
    expect(screen.getByText("Config, tests, docs, and entry points")).toBeInTheDocument();

    // Each group shows its churn summary "{files} files · +{a} −{d}".
    expect(screen.getByText("1 files · +2 −1")).toBeInTheDocument();
  });

  it("expands core files and collapses boilerplate without findings", () => {
    renderViewer(smartDiff());

    // The core file body is open, so its added line renders.
    expect(screen.getByText("const c = 4;")).toBeInTheDocument();
    // Boilerplate has no findings → stays collapsed, its body not rendered.
    expect(screen.queryByText("new")).not.toBeInTheDocument();
  });

  it("shows a finding dot + count badge, and jumping scrolls the line into view", async () => {
    renderViewer(smartDiff(), [finding]);

    const jump = screen.getByRole("button", {
      name: "Jump to first finding in src/service.ts",
    });
    // The badge text is "{count} findings".
    expect(within(jump).getByText("1 findings")).toBeInTheDocument();

    fireEvent.click(jump);
    // The scroll runs inside a requestAnimationFrame (the target row does not
    // exist until the open-state update commits), so wait for the next frame.
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });

  it("marks only the lines a finding touches", () => {
    const { container } = renderViewer(smartDiff(), [finding]);
    // The finding sits on new-side line 3 of src/service.ts → row id `path-3`.
    expect(container.querySelector("#src\\/service\\.ts-3")).not.toBeNull();
  });

  it("renders the split-suggestion card only when the PR is too big", () => {
    const { rerender } = renderViewer(smartDiff());
    // Not too big → no card.
    expect(screen.queryByText(/This PR is large/)).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <SmartDiffViewer
          smartDiff={smartDiff({
            split_suggestion: {
              too_big: true,
              total_lines: 900,
              proposed_splits: [{ name: "src/api", files: ["src/api/a.ts", "src/api/b.ts"] }],
            },
          })}
          files={files}
          findings={[]}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("This PR is large (900 changed lines)")).toBeInTheDocument();
    expect(screen.getByText("src/api")).toBeInTheDocument();
  });
});
