/**
 * Shared response shaping + error-forward helpers for every tool.
 *
 * Two concerns:
 *  1. Token discipline — findings are shaped down to a concise/detailed subset,
 *     severity-ordered, and capped with a truncation note so a large review does
 *     not blow the response budget.
 *  2. Prompt-injection defense — third-party-derived text (findings, conventions)
 *     is wrapped in an explicit untrusted marker so a downstream model treats it
 *     as data, not instructions (`security` skill; mirrors reviewer-core's
 *     <untrusted> convention). We do NOT keyword-scan the content — a denylist
 *     catches one phrasing in one language and gives false confidence.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Severity } from '@devdigest/shared';
import type { ReviewFindingDto } from '../api/client.js';

/** Max findings returned before truncation. Keeps a large review within budget. */
export const FINDINGS_CAP = 25;

/** Severity ordering for sort + cap. Higher index = shown first. */
const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

/** Valid severities, derived from the shared contract (never a local literal). */
const VALID_SEVERITIES = new Set<string>(Severity.options);

/**
 * MCP tool result — a single text content block. Aliased to the SDK's
 * `CallToolResult` so handlers are structurally assignable to `registerTool`'s
 * callback return type (which carries an index signature + richer content).
 */
export type ToolTextResult = CallToolResult;

/** A successful JSON result (object serialized COMPACT into a text content block). */
export function okJson(obj: unknown): ToolTextResult {
  return { content: [{ type: 'text', text: JSON.stringify(obj) }] };
}

/** An error result the model can act on: `isError:true` with a plain-text message. */
export function toolError(message: string): ToolTextResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * Wrap untrusted third-party text so a downstream model does not treat it as
 * instructions. `source` labels provenance (e.g. "pr_findings", "repo_conventions").
 */
export function wrapUntrusted(source: string, text: string): string {
  return `<untrusted_content source="${source}">\n${text}\n</untrusted_content>`;
}

/** Normalize a free-string `response_format` to a known mode; unknown → concise. */
export function normalizeFormat(raw: string | undefined): 'concise' | 'detailed' {
  return raw?.trim().toLowerCase() === 'detailed' ? 'detailed' : 'concise';
}

/**
 * Normalize a free-string severity filter. Returns the canonical uppercase value
 * when valid, `undefined` when absent, or `{ error }` when present but invalid —
 * so the caller can emit an error-forward message that teaches the valid set.
 */
export function normalizeSeverity(
  raw: string | undefined,
): { value: string | undefined } | { error: string } {
  if (raw === undefined || raw.trim() === '') return { value: undefined };
  const upper = raw.trim().toUpperCase();
  if (VALID_SEVERITIES.has(upper)) return { value: upper };
  return {
    error: `Unknown severity "${raw}". Use one of: ${[...VALID_SEVERITIES].join(', ')} (or omit for all).`,
  };
}

/** A concise finding: the minimum a reviewer needs to locate and understand it. */
export interface ConciseFinding {
  severity: string;
  file: string;
  line: string;
  message: string;
}

/** A detailed finding adds the reasoning and fix context. */
export interface DetailedFinding extends ConciseFinding {
  rationale: string;
  suggestion?: string | null;
  category: string;
  confidence: number;
}

export interface ShapedFindings {
  items: (ConciseFinding | DetailedFinding)[];
  /** Count of findings that passed the severity filter, BEFORE the display cap. */
  total: number;
  truncated_note?: string;
}

/** Render a finding's line span: "42", or "42-58" when the span is multi-line. */
function lineLabel(f: ReviewFindingDto): string {
  return f.end_line > f.start_line ? `${f.start_line}-${f.end_line}` : String(f.start_line);
}

/**
 * Shape review findings for a tool response:
 *  - optional minimum-severity filter (canonical value already validated),
 *  - severity-ordered (CRITICAL > WARNING > SUGGESTION), stable within a bucket,
 *  - capped at FINDINGS_CAP with a truncation note when more were dropped.
 */
export function shapeFindings(
  findings: ReviewFindingDto[],
  opts: { format: 'concise' | 'detailed'; severity?: string | undefined },
): ShapedFindings {
  const minRank = opts.severity ? (SEVERITY_ORDER[opts.severity] ?? 0) : 0;
  const filtered = findings.filter((f) => (SEVERITY_ORDER[f.severity] ?? 0) >= minRank);

  const sorted = [...filtered].sort(
    (a, b) => (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0),
  );

  const capped = sorted.slice(0, FINDINGS_CAP);
  const items = capped.map((f) =>
    opts.format === 'detailed' ? toDetailed(f) : toConcise(f),
  );

  const shaped: ShapedFindings = { items, total: filtered.length };
  if (sorted.length > FINDINGS_CAP) {
    shaped.truncated_note = `Showing ${FINDINGS_CAP} of ${sorted.length} findings (severity-ordered). Filter by severity or use devdigest_get_findings for more.`;
  }
  return shaped;
}

function toConcise(f: ReviewFindingDto): ConciseFinding {
  return { severity: f.severity, file: f.file, line: lineLabel(f), message: f.title };
}

function toDetailed(f: ReviewFindingDto): DetailedFinding {
  return {
    ...toConcise(f),
    rationale: f.rationale,
    suggestion: f.suggestion ?? null,
    category: f.category,
    confidence: f.confidence,
  };
}
