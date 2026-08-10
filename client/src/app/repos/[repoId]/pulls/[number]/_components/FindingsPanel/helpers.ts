import type { FindingRecord, Severity } from "@devdigest/shared";
import { sortBySeverity } from "@/lib/domain/findings";
import { LOW_CONFIDENCE_THRESHOLD } from "./constants";

/**
 * Optionally narrow to one severity, optionally drop low-confidence findings,
 * then sort by severity.
 *
 * The two filters compose as an AND — a low-confidence CRITICAL is hidden when
 * both are active. Severity goes first only because it is the cheaper cut.
 */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity?: Severity | null,
): FindingRecord[] {
  let shown = findings;
  if (severity) shown = shown.filter((f) => f.severity === severity);
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return sortBySeverity(shown);
}
