/**
 * FindingsHoverCard is hover-only and portalled to <body> — the PR list's table
 * card sets `overflow: hidden`, which would clip an in-row absolute card. These
 * tests pin the hover lifecycle, the worst-first ordering, and the "+N more"
 * clamp, so the card can never quietly grow into an unbounded list.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";
import { FindingsHoverCard } from "./FindingsHoverCard";
import { POPOVER_MAX_ITEMS } from "./constants";
import { rationalePreview, sortBySeverity, fileLabel } from "./helpers";

afterEach(cleanup);

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "WARNING",
    category: "bug",
    title: `finding ${o.id}`,
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "Something is off here.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("helpers", () => {
  it("sorts worst-first without mutating the input", () => {
    const input = [
      finding({ id: "s", severity: "SUGGESTION" }),
      finding({ id: "c", severity: "CRITICAL" }),
      finding({ id: "w", severity: "WARNING" }),
    ];
    expect(sortBySeverity(input).map((f) => f.id)).toEqual(["c", "w", "s"]);
    expect(input.map((f) => f.id)).toEqual(["s", "c", "w"]);
  });

  it("previews only the first line of a rationale, clipped", () => {
    expect(rationalePreview("First line.\nSecond line.")).toBe("First line.");
    expect(rationalePreview("x".repeat(300))).toMatch(/…$/);
    expect(rationalePreview("x".repeat(300)).length).toBeLessThan(300);
  });

  it("collapses a single-line range", () => {
    expect(fileLabel({ file: "a.ts", start_line: 11, end_line: 11 })).toBe("a.ts:11");
    expect(fileLabel({ file: "a.ts", start_line: 61, end_line: 74 })).toBe("a.ts:61-74");
  });
});

describe("FindingsHoverCard", () => {
  it("shows the card on hover and removes it on leave", () => {
    renderWithIntl(
      <FindingsHoverCard findings={[finding({ id: "f1", title: "Hardcoded key" })]} title="1 findings">
        <span>counts</span>
      </FindingsHoverCard>,
    );
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByText("counts").parentElement!);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded key")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();

    fireEvent.mouseLeave(screen.getByText("counts").parentElement!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("reports hover state so the host can defer its fetch", () => {
    const onHoverChange = vi.fn();
    renderWithIntl(
      <FindingsHoverCard findings={[]} title="0 findings" onHoverChange={onHoverChange}>
        <span>counts</span>
      </FindingsHoverCard>,
    );
    const anchor = screen.getByText("counts").parentElement!;
    fireEvent.mouseEnter(anchor);
    expect(onHoverChange).toHaveBeenCalledWith(true);
    fireEvent.mouseLeave(anchor);
    expect(onHoverChange).toHaveBeenCalledWith(false);
  });

  it("clamps the list and reports the remainder", () => {
    const many = Array.from({ length: POPOVER_MAX_ITEMS + 3 }, (_, i) =>
      finding({ id: `f${i}`, title: `Finding number ${i}` }),
    );
    renderWithIntl(
      <FindingsHoverCard findings={many} title={`${many.length} findings`}>
        <span>counts</span>
      </FindingsHoverCard>,
    );
    fireEvent.mouseEnter(screen.getByText("counts").parentElement!);
    expect(screen.getByText("Finding number 0")).toBeInTheDocument();
    expect(screen.queryByText(`Finding number ${POPOVER_MAX_ITEMS}`)).not.toBeInTheDocument();
    expect(screen.getByText("+3 more")).toBeInTheDocument();
  });

  it("says it is loading while the findings are still in flight", () => {
    renderWithIntl(
      <FindingsHoverCard findings={[]} title="2 findings" loading>
        <span>counts</span>
      </FindingsHoverCard>,
    );
    fireEvent.mouseEnter(screen.getByText("counts").parentElement!);
    expect(screen.getByText("Loading findings…")).toBeInTheDocument();
  });
});
