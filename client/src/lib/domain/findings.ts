/* domain/findings.ts — severity rules for findings. Pure: no React, no CSS.

   Severity ORDERING and TALLYING are business rules, not presentation: the PR
   list, the findings panel, the hover card and the timeline must agree about the
   same set of findings. Colours and icons for a severity are a different concern
   and live in `@devdigest/ui` (`SEV`). */

import type { FindingsBySeverity } from "@devdigest/shared";

/** Sort weight per severity (lower = shown first), worst finding at the top. */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

/** Worst findings first. Stable, non-mutating; unknown severities sort last. */
export function sortBySeverity<T extends { severity: string }>(findings: T[]): T[] {
  return [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/**
 * Count findings per severity.
 *
 * Mirrors the server's `findingsBySeverity` (`server/src/modules/pulls/status.ts`):
 * anything outside the three known values is DROPPED, never bucketed.
 * `findings.severity` is free-form text with no CHECK constraint, so a model that
 * emits "HIGH" stores "HIGH" — and a fourth bucket has no colour, no icon, and no
 * contract.
 *
 * An empty input is `{0,0,0}` — "reviewed, and clean". "Never reviewed" is `null`
 * and is the caller's job to represent.
 */
export function severityTally(findings: { severity: string }[]): FindingsBySeverity {
  const counts: FindingsBySeverity = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity === "CRITICAL") counts.CRITICAL += 1;
    else if (f.severity === "WARNING") counts.WARNING += 1;
    else if (f.severity === "SUGGESTION") counts.SUGGESTION += 1;
  }
  return counts;
}

/** Total across the three buckets. `null`/`undefined` → 0. */
export function totalOf(counts: FindingsBySeverity | null | undefined): number {
  if (counts == null) return 0;
  return counts.CRITICAL + counts.WARNING + counts.SUGGESTION;
}
