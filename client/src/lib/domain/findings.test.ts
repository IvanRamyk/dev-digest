/**
 * The severity rules the whole app agrees on:
 *  - an unknown severity is DROPPED, not bucketed — `findings.severity` is
 *    free-form text with no CHECK constraint, and a fourth bucket has no contract;
 *  - `{0,0,0}` (reviewed and clean) is a real tally, distinct from `null`
 *    (never reviewed) which callers represent themselves;
 *  - ordering is stable and puts unknown severities last, so a model emitting
 *    "HIGH" cannot jump the queue ahead of CRITICAL.
 */
import { describe, it, expect } from "vitest";
import { SEVERITY_ORDER, sortBySeverity, severityTally, totalOf } from "./findings";

describe("severityTally", () => {
  it("counts the three known severities", () => {
    expect(
      severityTally([
        { severity: "CRITICAL" },
        { severity: "WARNING" },
        { severity: "WARNING" },
        { severity: "SUGGESTION" },
      ]),
    ).toEqual({ CRITICAL: 1, WARNING: 2, SUGGESTION: 1 });
  });

  it("drops unknown severities rather than bucketing them", () => {
    expect(severityTally([{ severity: "HIGH" }, { severity: "INFO" }, { severity: "" }])).toEqual({
      CRITICAL: 0,
      WARNING: 0,
      SUGGESTION: 0,
    });
  });

  it("returns a zeroed tally for no findings — reviewed and clean", () => {
    expect(severityTally([])).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
  });
});

describe("totalOf", () => {
  it("sums the three buckets", () => {
    expect(totalOf({ CRITICAL: 1, WARNING: 2, SUGGESTION: 3 })).toBe(6);
  });

  it("treats null/undefined as 0", () => {
    expect(totalOf(null)).toBe(0);
    expect(totalOf(undefined)).toBe(0);
  });
});

describe("sortBySeverity", () => {
  it("puts the worst finding first", () => {
    const sorted = sortBySeverity([
      { severity: "SUGGESTION", id: "s" },
      { severity: "CRITICAL", id: "c" },
      { severity: "WARNING", id: "w" },
    ]);
    expect(sorted.map((f) => f.id)).toEqual(["c", "w", "s"]);
  });

  it("sorts unknown severities last", () => {
    const sorted = sortBySeverity([
      { severity: "MYSTERY", id: "x" },
      { severity: "INFO", id: "i" },
      { severity: "CRITICAL", id: "c" },
    ]);
    expect(sorted.map((f) => f.id)).toEqual(["c", "i", "x"]);
  });

  it("does not mutate its input", () => {
    const input = [{ severity: "SUGGESTION" }, { severity: "CRITICAL" }];
    const copy = [...input];
    sortBySeverity(input);
    expect(input).toEqual(copy);
  });

  it("keeps equal severities in their original order", () => {
    const sorted = sortBySeverity([
      { severity: "WARNING", id: "first" },
      { severity: "WARNING", id: "second" },
    ]);
    expect(sorted.map((f) => f.id)).toEqual(["first", "second"]);
  });
});

describe("SEVERITY_ORDER", () => {
  it("ranks CRITICAL worst through INFO least", () => {
    expect(SEVERITY_ORDER.CRITICAL).toBeLessThan(SEVERITY_ORDER.WARNING!);
    expect(SEVERITY_ORDER.WARNING).toBeLessThan(SEVERITY_ORDER.SUGGESTION!);
    expect(SEVERITY_ORDER.SUGGESTION).toBeLessThan(SEVERITY_ORDER.INFO!);
  });
});
