import type { SmartDiff, SmartDiffFile, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import {
  BOILERPLATE_SPLIT_NAME,
  MAX_FINDING_LINE_SPAN,
  MAX_PROPOSED_SPLITS,
  MIN_FILES_PER_SPLIT,
  REMAINDER_SPLIT_NAME,
  ROLE_ORDER,
  SPLIT_DIR_DEPTH,
  SPLIT_TOO_BIG_CORE_FILES,
  SPLIT_TOO_BIG_LINES,
} from './constants.js';

/**
 * Smart Diff pure transforms. No DB, no `this`, no I/O: every function here folds
 * over rows the repository already fetched, so grouping / ordering / counts / the
 * split heuristic all unit-test without Postgres.
 *
 * Two folds mirror the PR-list rollups deliberately: `currentFindingRows` is the
 * sibling of `pulls/helpers.ts:foldFindingsByPr` — same latest-run-per-agent rule,
 * so the diff marks and the PR-list severity tally can never disagree.
 */

/** One finding location, joined out to its run + review — see `currentFindingRows`. */
export interface RunFindingLocationRow {
  agentId: string | null;
  runId: string;
  reviewId: string | null;
  file: string | null;
  startLine: number | null;
  endLine: number | null;
  severity: string | null;
}

/** A finding on a review with NO run behind it (the seeded demo review). */
export interface OrphanFindingLocationRow {
  file: string | null;
  startLine: number | null;
  endLine: number | null;
  severity: string | null;
}

/** A resolved current finding location: run/review gating already applied. */
export interface FindingLocation {
  file: string;
  startLine: number;
  endLine: number;
  severity: string;
}

/** A file row as the classifier needs it (no `patch` — the client has the diff). */
export interface FileRow {
  path: string;
  additions: number;
  deletions: number;
}

/** Severity rank for the intra-group ordering; higher is worse. */
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };
function severityRank(sev: string): number {
  return SEVERITY_RANK[sev] ?? 0;
}

/**
 * The latest-run fold: each agent's LATEST run wins its slot, and only findings
 * from a run that actually produced a review count. Sibling of
 * `pulls/helpers.ts:foldFindingsByPr`.
 *
 * `runRows` MUST arrive newest-first (`ran_at DESC`). Three rules:
 *   - first row per `agentId ?? 'orphaned'` wins that agent's slot;
 *   - a slot won by a run with `reviewId == null` (failed / cancelled / running)
 *     contributes nothing — it does NOT fall through to that agent's older run;
 *   - every `run_id IS NULL` review (an orphan) always counts, since nothing can
 *     supersede it.
 */
export function currentFindingRows(
  runRows: RunFindingLocationRow[],
  orphanRows: OrphanFindingLocationRow[],
): FindingLocation[] {
  const out: FindingLocation[] = [];
  const keptRunIds = new Set<string>();
  const seenAgents = new Set<string>();

  for (const row of runRows) {
    const agentKey = row.agentId ?? 'orphaned';
    if (!seenAgents.has(agentKey)) {
      seenAgents.add(agentKey);
      keptRunIds.add(row.runId);
    }
    if (!keptRunIds.has(row.runId)) continue;
    // Gate on the REVIEW, not the run: a dead newest run has no review and must
    // contribute nothing (not fall through to a superseded attempt).
    if (row.reviewId == null) continue;
    const loc = toLocation(row);
    if (loc) out.push(loc);
  }

  for (const row of orphanRows) {
    const loc = toLocation(row);
    if (loc) out.push(loc);
  }
  return out;
}

/** A join row → a finding location, or null when the LEFT JOIN produced no finding. */
function toLocation(row: {
  file: string | null;
  startLine: number | null;
  endLine: number | null;
  severity: string | null;
}): FindingLocation | null {
  if (row.file == null || row.startLine == null || row.endLine == null || row.severity == null) {
    return null;
  }
  return {
    file: row.file,
    startLine: row.startLine,
    endLine: row.endLine,
    severity: row.severity,
  };
}

/**
 * Per-file `finding_lines`: the union of each finding's inclusive
 * `[start_line, end_line]`, deduped and sorted ascending. A range wider than
 * `MAX_FINDING_LINE_SPAN` collapses to just its `start_line` (a 400-line finding
 * would otherwise flood the file with marks).
 */
export function findingLinesByFile(locations: FindingLocation[]): Map<string, number[]> {
  const setByFile = new Map<string, Set<number>>();
  for (const loc of locations) {
    let set = setByFile.get(loc.file);
    if (!set) {
      set = new Set<number>();
      setByFile.set(loc.file, set);
    }
    const span = loc.endLine - loc.startLine;
    if (span < 0 || span > MAX_FINDING_LINE_SPAN) {
      set.add(loc.startLine);
    } else {
      for (let ln = loc.startLine; ln <= loc.endLine; ln++) set.add(ln);
    }
  }
  const out = new Map<string, number[]>();
  for (const [file, set] of setByFile) {
    out.set(file, [...set].sort((a, b) => a - b));
  }
  return out;
}

/** The worst severity seen on a file, or null if none. Used for intra-group ordering. */
function worstSeverityByFile(locations: FindingLocation[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const loc of locations) {
    const prev = out.get(loc.file);
    if (prev == null || severityRank(loc.severity) > severityRank(prev)) {
      out.set(loc.file, loc.severity);
    }
  }
  return out;
}

/** Count of findings per file. */
function findingCountByFile(locations: FindingLocation[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const loc of locations) out.set(loc.file, (out.get(loc.file) ?? 0) + 1);
  return out;
}

/**
 * Classify, bucket, and order the files into the three groups.
 *
 * Always emits all three groups in `ROLE_ORDER`, including empty ones, so
 * `Σ group.files.length === files.length` is an assertable invariant.
 *
 * Within a group, files sort by: has-findings desc → worst severity desc →
 * finding count desc → churn desc → PATH asc. The path tiebreak is the stable
 * final key, so the same PR yields the same order on every request.
 */
export function buildGroups(files: FileRow[], locations: FindingLocation[]): SmartDiffGroup[] {
  const linesByFile = findingLinesByFile(locations);
  const worstByFile = worstSeverityByFile(locations);
  const countByFile = findingCountByFile(locations);

  const byRole = new Map<SmartDiffRole, SmartDiffFile[]>();
  for (const role of ROLE_ORDER) byRole.set(role, []);

  for (const f of files) {
    const role = classifyFile(f);
    byRole.get(role)!.push({
      path: f.path,
      pseudocode_summary: null,
      additions: f.additions,
      deletions: f.deletions,
      finding_lines: linesByFile.get(f.path) ?? [],
    });
  }

  return ROLE_ORDER.map((role) => {
    const filesInRole = byRole.get(role)!;
    filesInRole.sort((a, b) => compareFiles(a, b, worstByFile, countByFile));
    return { role, files: filesInRole };
  });
}

function compareFiles(
  a: SmartDiffFile,
  b: SmartDiffFile,
  worstByFile: Map<string, string>,
  countByFile: Map<string, number>,
): number {
  const aHas = a.finding_lines.length > 0 ? 1 : 0;
  const bHas = b.finding_lines.length > 0 ? 1 : 0;
  if (aHas !== bHas) return bHas - aHas;

  const aSev = severityRank(worstByFile.get(a.path) ?? '');
  const bSev = severityRank(worstByFile.get(b.path) ?? '');
  if (aSev !== bSev) return bSev - aSev;

  const aCount = countByFile.get(a.path) ?? 0;
  const bCount = countByFile.get(b.path) ?? 0;
  if (aCount !== bCount) return bCount - aCount;

  const aChurn = a.additions + a.deletions;
  const bChurn = b.additions + b.deletions;
  if (aChurn !== bChurn) return bChurn - aChurn;

  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/**
 * The split suggestion. `total_lines` is Σ churn over ALL files; `too_big` trips
 * when total churn exceeds `SPLIT_TOO_BIG_LINES` OR the `core` file count exceeds
 * `SPLIT_TOO_BIG_CORE_FILES`.
 *
 * When too big: bucket core+wiring files by their first `SPLIT_DIR_DEPTH` path
 * segments, fold buckets under `MIN_FILES_PER_SPLIT` into a `rest` bucket, sort by
 * churn desc, cap at `MAX_PROPOSED_SPLITS`, then append a `generated` split if any
 * boilerplate exists. A split `name` is the DIRECTORY PREFIX itself (`src/api`) —
 * never prose, which could not be translated.
 */
export function buildSplitSuggestion(groups: SmartDiffGroup[]): SmartDiff['split_suggestion'] {
  const allFiles = groups.flatMap((g) => g.files);
  const totalLines = allFiles.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  const coreCount = groups.find((g) => g.role === 'core')?.files.length ?? 0;
  const tooBig = totalLines > SPLIT_TOO_BIG_LINES || coreCount > SPLIT_TOO_BIG_CORE_FILES;

  if (!tooBig) {
    return { too_big: false, total_lines: totalLines, proposed_splits: [] };
  }

  const reviewable = groups
    .filter((g) => g.role === 'core' || g.role === 'wiring')
    .flatMap((g) => g.files);

  const buckets = new Map<string, { files: string[]; churn: number }>();
  for (const f of reviewable) {
    const prefix = dirPrefix(f.path, SPLIT_DIR_DEPTH);
    let bucket = buckets.get(prefix);
    if (!bucket) {
      bucket = { files: [], churn: 0 };
      buckets.set(prefix, bucket);
    }
    bucket.files.push(f.path);
    bucket.churn += f.additions + f.deletions;
  }

  // Fold small buckets into `rest`.
  const rest = { files: [] as string[], churn: 0 };
  const named: { name: string; files: string[]; churn: number }[] = [];
  for (const [name, bucket] of buckets) {
    if (bucket.files.length < MIN_FILES_PER_SPLIT) {
      rest.files.push(...bucket.files);
      rest.churn += bucket.churn;
    } else {
      named.push({ name, files: bucket.files, churn: bucket.churn });
    }
  }

  named.sort((a, b) => b.churn - a.churn || (a.name < b.name ? -1 : 1));
  let splits = named.slice(0, MAX_PROPOSED_SPLITS).map((b) => ({ name: b.name, files: b.files }));

  if (rest.files.length > 0) {
    splits.push({ name: REMAINDER_SPLIT_NAME, files: rest.files.sort() });
  }

  const boilerplate = groups.find((g) => g.role === 'boilerplate')?.files ?? [];
  if (boilerplate.length > 0) {
    splits.push({
      name: BOILERPLATE_SPLIT_NAME,
      files: boilerplate.map((f) => f.path).sort(),
    });
  }

  return { too_big: true, total_lines: totalLines, proposed_splits: splits };
}

/** The first `depth` posix segments of a path (its directory prefix). */
function dirPrefix(path: string, depth: number): string {
  const segments = path.split('/');
  // A bare filename (no directory) buckets under itself.
  if (segments.length <= 1) return path;
  return segments.slice(0, depth).join('/');
}
