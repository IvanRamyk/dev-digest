/** Pure helpers for FindingsHoverCard. */

import type { FindingRecord } from "@devdigest/shared";
import { RATIONALE_MAX_CHARS, SEVERITY_ORDER } from "./constants";

/** Worst findings first, so the card leads with what matters. Stable, non-mutating. */
export function sortBySeverity(findings: FindingRecord[]): FindingRecord[] {
  return [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/** First line of the rationale, clipped. The card is a preview, not the finding. */
export function rationalePreview(rationale: string): string {
  const firstLine = rationale.split("\n")[0]?.trim() ?? "";
  if (firstLine.length <= RATIONALE_MAX_CHARS) return firstLine;
  return `${firstLine.slice(0, RATIONALE_MAX_CHARS).trimEnd()}…`;
}

/** "src/config.ts:11" or "src/api/webhooks.ts:61-74". */
export function fileLabel(f: Pick<FindingRecord, "file" | "start_line" | "end_line">): string {
  const lines = f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
  return `${f.file}:${lines}`;
}
