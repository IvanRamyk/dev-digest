/* SmartDiffViewer helpers — pure, single-consumer, so colocated (C11/C12).

   Smart Diff owns grouping/ordering/counts (server) and which colour sits on
   which line (client). These helpers do the client-side join: SmartDiffFile
   carries the line numbers and finding_lines; the live findings from the review
   cache carry severity; the PrDetail file carries the patch body. */
import type { Severity } from "@devdigest/ui";
import type { PrFile, SmartDiffFile, SmartDiffGroup, FindingRecord } from "@devdigest/shared";
import { SEVERITY_ORDER } from "@/lib/domain/findings";

/** path → the PrDetail file (with its patch body). Smart Diff carries no patch. */
export function filesByPath(files: PrFile[]): Map<string, PrFile> {
  const m = new Map<string, PrFile>();
  for (const f of files) m.set(f.path, f);
  return m;
}

/** Findings on one file only. */
function findingsForPath(path: string, findings: FindingRecord[]): FindingRecord[] {
  return findings.filter((f) => f.file === path);
}

/** new-side line number → worst severity of any finding touching it.
    Worst severity wins a shared line (CRITICAL over WARNING over SUGGESTION). */
export function marksForFile(
  path: string,
  findings: FindingRecord[],
): Map<number, Severity> {
  const marks = new Map<number, Severity>();
  for (const f of findingsForPath(path, findings)) {
    const sev = f.severity as Severity;
    const weight = SEVERITY_ORDER[sev] ?? 9;
    for (let line = f.start_line; line <= f.end_line; line++) {
      const existing = marks.get(line);
      if (existing == null || weight < (SEVERITY_ORDER[existing] ?? 9)) {
        marks.set(line, sev);
      }
    }
  }
  return marks;
}

/** How many findings this file carries. Prefers the live findings join (which
    also has severity) and falls back to the server's `finding_lines.length`
    while the reviews query is still loading. */
export function findingCountForFile(file: SmartDiffFile, findings: FindingRecord[]): number {
  const live = findingsForPath(file.path, findings).length;
  return live > 0 ? live : file.finding_lines.length;
}

/** Worst severity across a file's live findings, or null when the reviews query
    has not resolved yet (server `finding_lines` carries no severity — the join
    is client-side, so the badge colour cannot be known until findings load). */
export function worstSeverityForFile(
  path: string,
  findings: FindingRecord[],
): Severity | null {
  let worst: Severity | null = null;
  for (const f of findingsForPath(path, findings)) {
    const sev = f.severity as Severity;
    const weight = SEVERITY_ORDER[sev] ?? 9;
    if (worst == null || weight < (SEVERITY_ORDER[worst] ?? 9)) worst = sev;
  }
  return worst;
}

/** First finding line on a file, or null when it has none. */
export function firstFindingLine(file: SmartDiffFile): number | null {
  if (file.finding_lines.length === 0) return null;
  return Math.min(...file.finding_lines);
}

/** The next finding line strictly after `after`, wrapping to the first. Lets a
    repeated click on the badge cycle through a file's findings. */
export function nextFindingLine(file: SmartDiffFile, after: number | null): number | null {
  if (file.finding_lines.length === 0) return null;
  const sorted = [...file.finding_lines].sort((a, b) => a - b);
  if (after == null) return sorted[0]!;
  const next = sorted.find((l) => l > after);
  return next ?? sorted[0]!;
}

/** File count and churn totals over a set of files (a group, or all of them). */
export function totalsOf(
  files: readonly SmartDiffFile[],
): { files: number; additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    additions += f.additions;
    deletions += f.deletions;
  }
  return { files: files.length, additions, deletions };
}

/** Totals across every group's files. */
export function totalsOfGroups(
  groups: readonly SmartDiffGroup[],
): { files: number; additions: number; deletions: number } {
  return totalsOf(groups.flatMap((g) => g.files));
}
