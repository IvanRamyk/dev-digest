/**
 * RunCostBadge — the formatting contract is the whole point of this component:
 * a run's cost must stay readable at $0.001 scale, and "unknown" must never be
 * mistaken for "free". Both are acceptance criteria of specs/run-cost-badge.md.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";
import { formatCost, formatTokenTotal } from "@/lib/domain/cost";

afterEach(cleanup);

describe("formatCost", () => {
  it("keeps 3 significant figures instead of collapsing to $0.00", () => {
    // The regression this guards: toFixed(2) renders every one of these "$0.00".
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.012)).toBe("$0.012");
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(0.0134)).toBe("$0.0134");
    expect(formatCost(0.06)).toBe("$0.06");
  });

  it("renders unknown cost as an em-dash, never as a number", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("renders a free model as $0 — data, not missing data", () => {
    expect(formatCost(0)).toBe("$0");
  });

  it("uses plain 2dp at a dollar and above", () => {
    expect(formatCost(1.5)).toBe("$1.50");
    expect(formatCost(12.3456)).toBe("$12.35");
  });

  it("floors sub-microdollar costs rather than going exponential", () => {
    expect(formatCost(0.00000005)).toBe("<$0.000001");
  });
});

describe("formatTokenTotal", () => {
  it("sums in+out with thousands separators", () => {
    expect(formatTokenTotal(9000, 119)).toBe("9,119");
  });

  it("treats null token counts as zero", () => {
    expect(formatTokenTotal(null, null)).toBe("0");
    expect(formatTokenTotal(100, null)).toBe("100");
  });
});

describe("RunCostBadge", () => {
  it("compact renders the cost alone", () => {
    render(<RunCostBadge costUsd={0.014} />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("with-tokens renders tokens and cost together", () => {
    render(<RunCostBadge variant="with-tokens" costUsd={0.0013} tokensIn={9000} tokensOut={119} />);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("with-tokens drops the token half when nothing ran", () => {
    render(<RunCostBadge variant="with-tokens" costUsd={null} tokensIn={0} tokensOut={0} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/tok/)).not.toBeInTheDocument();
  });
});
