import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionScan,
  ConventionScanStatus,
  ConventionSource,
  ConventionStatus,
  ConventionVerification,
} from '@devdigest/shared';
import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  PRETTIER_RESTATEMENT_PATTERNS,
  RULE_KEY_STOPWORDS,
  UNVERIFIED_CONFIDENCE,
} from './constants.js';
import type { RawCandidate } from './types.js';

/**
 * Conventions pure helpers. No I/O — everything here is unit-testable without
 * Postgres, a clone, or a model call.
 */

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

export function toDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    scan_id: row.scanId,
    rule: row.rule,
    category: row.category as ConventionCategory,
    status: row.status as ConventionStatus,
    source: row.source as ConventionSource,
    evidence_path: row.evidencePath ?? '',
    evidence_start_line: row.evidenceStartLine,
    evidence_end_line: row.evidenceEndLine,
    evidence_snippet: row.evidenceSnippet ?? '',
    verification: row.verification as ConventionVerification,
    support_count: row.supportCount,
    violation_count: row.violationCount,
    confidence: row.confidence ?? 0,
    accepted: row.accepted,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toScanDto(row: ConventionScanRow): ConventionScan {
  return {
    id: row.id,
    repo_id: row.repoId,
    status: row.status as ConventionScanStatus,
    sample_file_count: row.sampleFileCount,
    batch_count: row.batchCount,
    provider: row.provider,
    model: row.model,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    candidates_found: row.candidatesFound,
    candidates_kept: row.candidatesKept,
    degraded_reason: row.degradedReason,
    error: row.error,
    started_at: row.startedAt ? row.startedAt.toISOString() : null,
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// S5 reduce — rule-key normalization + dedupe
// ---------------------------------------------------------------------------

/** Strip a trailing "instead of X" / "rather than X" comparison clause — it
 *  describes what NOT to do, not the rule's identity, and its own operand
 *  (e.g. a second backtick-quoted token) would otherwise block two phrasings
 *  of the same rule from colliding. */
const TRAILING_CUES = [/\binstead of\b[\s\S]*$/i, /\brather than\b[\s\S]*$/i];

/**
 * Normalize a rule's text to a dedupe slug: strip the comparison clause,
 * lowercase, drop separator punctuation (but keep operator glyphs like `===`
 * intact, since those often carry the entire signal), drop connective
 * stopwords, dedupe + sort the remaining tokens, join with `-`.
 *
 * "Always use ===" and "Use `===` instead of `==`" both collapse to "===".
 */
export function normalizeRuleKey(rule: string): string {
  let s = rule;
  for (const re of TRAILING_CUES) s = s.replace(re, '');
  s = s.replace(/[`'"(),.;:]/g, ' ').toLowerCase();
  const words = s
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !RULE_KEY_STOPWORDS.has(w));
  return [...new Set(words)].sort().join('-');
}

/** A rule too thin to be worth a card: empty, a question, or a stray TODO. */
export function isJunkRuleText(rule: string): boolean {
  const trimmed = rule.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.endsWith('?')) return true;
  if (/\btodo\b/i.test(trimmed)) return true;
  return false;
}

/** A model-authored candidate that's really just restating a Prettier concern
 *  (decision 5) — dropped in S5 regardless of source, since it fails test 1
 *  (the formatter, not the reviewer, would catch it). */
export function isPrettierRestatement(rule: string): boolean {
  return PRETTIER_RESTATEMENT_PATTERNS.some((re) => re.test(rule));
}

/**
 * Group candidates by `normalizeRuleKey`, keep one per group: a config-sourced
 * row always wins its group (decision 5's exemption), otherwise the
 * lowest-`rank` (strongest-evidence) candidate wins, ties broken by the
 * longer rule text (assumed more specific).
 */
export function dedupeCandidates<T extends RawCandidate>(candidates: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const c of candidates) {
    const key = normalizeRuleKey(c.rule);
    const arr = groups.get(key);
    if (arr) arr.push(c);
    else groups.set(key, [c]);
  }
  const out: T[] = [];
  for (const group of groups.values()) {
    const configRow = group.find((c) => c.source === 'config');
    if (configRow) {
      out.push(configRow);
      continue;
    }
    const winner = [...group].sort((a, b) => a.rank - b.rank || b.rule.length - a.rule.length)[0]!;
    out.push(winner);
  }
  return out;
}

// ---------------------------------------------------------------------------
// S3 read
// ---------------------------------------------------------------------------

/** `N| text` per line, so the model can cite a line number back at us. */
export function numberLines(lines: string[]): string {
  return lines.map((line, i) => `${i + 1}| ${line}`).join('\n');
}

/** 1-based line where `source` is imported/required, or `1` as a harmless
 *  fallback (mined-pattern evidence is display-only — it skips verification). */
export function findImportLine(lines: string[], source: string): number {
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`['"\`]${escaped}['"\`]`);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i]!)) return i + 1;
  }
  return 1;
}

// ---------------------------------------------------------------------------
// S4b batching
// ---------------------------------------------------------------------------

/** Group paths by first path segment (rough directory affinity), chunk each
 *  group to `batchSize`, and stop emitting once `maxBatches` is reached. */
export function groupFilesIntoBatches(paths: string[], batchSize: number, maxBatches: number): string[][] {
  const byDir = new Map<string, string[]>();
  for (const p of paths) {
    const seg = p.split('/')[0] ?? p;
    const arr = byDir.get(seg);
    if (arr) arr.push(p);
    else byDir.set(seg, [p]);
  }
  const batches: string[][] = [];
  for (const files of byDir.values()) {
    for (let i = 0; i < files.length; i += batchSize) {
      batches.push(files.slice(i, i + batchSize));
      if (batches.length >= maxBatches) return batches;
    }
  }
  return batches;
}

// ---------------------------------------------------------------------------
// Confidence — computed, never model-reported
// ---------------------------------------------------------------------------

export function computeConfidence(
  support: number,
  violation: number,
  verification: ConventionVerification,
): number {
  if (verification === 'config') return 1;
  if (verification === 'unverified') return UNVERIFIED_CONFIDENCE;
  if (support <= 0) return 0;
  // Laplace-smoothed: 3/0 → .75, 40/0 → .976.
  return support / (support + violation + 1);
}

// ---------------------------------------------------------------------------
// Security guards
// ---------------------------------------------------------------------------

/** Reject absolute paths, `..` traversal segments, backslashes, and `:` —
 *  `SimpleGitClient.readFile` has no traversal guard of its own. */
export function isSafeRepoRelativePath(path: string): boolean {
  if (path.length === 0) return false;
  if (path.startsWith('/')) return false;
  if (path.includes('\\')) return false;
  if (path.includes(':')) return false;
  if (path.split('/').some((seg) => seg === '..')) return false;
  return true;
}

/** Reject a leading `-` (parsed as an rg flag), overlong patterns, backreferences
 *  (`\1`–`\9`), an obvious nested-unbounded-quantifier ReDoS shape, and anything
 *  `new RegExp` itself rejects. */
export function isSafeGrepPattern(pattern: string): boolean {
  if (pattern.length === 0 || pattern.length > 120) return false;
  if (pattern.startsWith('-')) return false;
  if (/\\[1-9]/.test(pattern)) return false;
  if (/\([^()]*[+*]\)[+*]/.test(pattern)) return false;
  try {
    new RegExp(pattern);
  } catch {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// S2 fallback sampler
// ---------------------------------------------------------------------------

const SAMPLE_EXTENSIONS: ReadonlySet<string> = new Set(['.ts', '.tsx', '.js', '.jsx']);

/** Path kinds excluded from the fallback sample: tests, configs, declaration
 *  files, migrations, generated dirs. Mirrors repo-intel's JUNK_PATH_PATTERNS
 *  (kept local — repo-intel doesn't export its version). */
const JUNK_PATH_PATTERNS = [
  '.test.', '.spec.', '.d.ts', '__tests__/', '__mocks__/', '/test/', '/tests/',
  '/migrations/', '/__fixtures__/', '.config.', 'vitest.', 'jest.', 'eslint', 'prettier',
] as const;

export function isSamplePath(path: string): boolean {
  const dot = path.lastIndexOf('.');
  const ext = dot >= 0 ? path.slice(dot) : '';
  if (!SAMPLE_EXTENSIONS.has(ext)) return false;
  const lower = path.toLowerCase();
  return !JUNK_PATH_PATTERNS.some((p) => lower.includes(p));
}

// ---------------------------------------------------------------------------
// config-rules.ts support — JSONC comment stripping
// ---------------------------------------------------------------------------

/** Strip `//` and `/* *‍/` comments from a JSONC string (tsconfig.json),
 *  respecting string literals, then drop trailing commas before `}`/`]`. */
export function stripJsonComments(raw: string): string {
  let out = '';
  let inString = false;
  let stringChar = '';
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    const next = raw[i + 1];
    if (inLineComment) {
      if (c === '\n') {
        inLineComment = false;
        out += c;
      }
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i++;
        continue;
      }
      if (c === stringChar) inString = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inString = true;
      stringChar = c;
      out += c;
      continue;
    }
    if (c === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

// ---------------------------------------------------------------------------
// Client-facing skill body
// ---------------------------------------------------------------------------

export interface SkillBodyCandidate {
  rule: string;
  category: ConventionCategory;
  source: ConventionSource;
  evidencePath: string;
  evidenceStartLine: number | null;
  evidenceEndLine: number | null;
  supportCount: number;
  violationCount: number;
}

function evidenceLine(c: SkillBodyCandidate): string {
  if (c.source === 'config') return 'Evidence: from project config';
  const lines =
    c.evidenceStartLine != null
      ? `:${c.evidenceStartLine}${
          c.evidenceEndLine != null && c.evidenceEndLine !== c.evidenceStartLine ? `-${c.evidenceEndLine}` : ''
        }`
      : '';
  const files = `${c.supportCount} file${c.supportCount === 1 ? '' : 's'} support`;
  const exceptions = `${c.violationCount} exception${c.violationCount === 1 ? '' : 's'}`;
  return `Evidence: \`${c.evidencePath}${lines}\` — ${files}, ${exceptions}`;
}

/** Merge accepted candidates into one skill body: `# <repo> conventions` →
 *  intro → `## <Category>` sections in CATEGORY_ORDER, each rule with its
 *  evidence line. The one home for the merge rule — client renders the
 *  server's output verbatim (editable before save, but not re-derived). */
export function buildSkillBody(repoFullName: string, candidates: SkillBodyCandidate[]): string {
  const byCategory = new Map<ConventionCategory, SkillBodyCandidate[]>();
  for (const c of candidates) {
    const arr = byCategory.get(c.category);
    if (arr) arr.push(c);
    else byCategory.set(c.category, [c]);
  }

  const lines: string[] = [`# ${repoFullName} conventions`, '', 'House rules extracted from this repo, each backed by evidence.'];
  for (const category of CATEGORY_ORDER) {
    const rows = byCategory.get(category);
    if (!rows || rows.length === 0) continue;
    lines.push('', `## ${CATEGORY_LABELS[category]}`);
    for (const c of rows) {
      lines.push('', `- ${c.rule}`, `  ${evidenceLine(c)}`);
    }
  }
  return lines.join('\n');
}
