/**
 * Cost formatting guards the distinction the badge exists for: `null` (unknown —
 * unpriced model, or the run never finished) is NOT `0` (a real free model). See
 * client/INSIGHTS.md 2026-08-05 — `toFixed(2)` renders real runs as "$0.00", and
 * round-tripping toPrecision through Number reintroduces float artifacts.
 */
import { describe, it, expect } from "vitest";
import { formatCost, formatTokenTotal, NO_DATA } from "./cost";

describe("formatCost", () => {
  it("renders unknown cost as an em-dash, never as free", () => {
    expect(formatCost(null)).toBe(NO_DATA);
    expect(formatCost(undefined)).toBe(NO_DATA);
  });

  it("renders a real zero as $0 — a free model is data, not absence", () => {
    expect(formatCost(0)).toBe("$0");
  });

  it("keeps sub-cent runs legible instead of collapsing them to $0.00", () => {
    expect(formatCost(0.0134)).toBe("$0.0134");
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0.0002)).toBe("$0.0002");
  });

  it("strips trailing zeros without eating integer digits", () => {
    expect(formatCost(0.06)).toBe("$0.06");
    expect(formatCost(0.5)).toBe("$0.5");
  });

  it("uses plain 2dp at a dollar and above", () => {
    expect(formatCost(1)).toBe("$1.00");
    expect(formatCost(12.345)).toBe("$12.35");
  });

  it("floors to a sentinel instead of going exponential", () => {
    expect(formatCost(1e-8)).toBe("<$0.000001");
  });
});

describe("formatTokenTotal", () => {
  it("sums and separates thousands", () => {
    expect(formatTokenTotal(9000, 119)).toBe("9,119");
  });

  it("treats null as zero on either side", () => {
    expect(formatTokenTotal(null, 500)).toBe("500");
    expect(formatTokenTotal(500, null)).toBe("500");
    expect(formatTokenTotal(null, null)).toBe("0");
  });
});
