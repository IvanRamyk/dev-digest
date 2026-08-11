import type { UnifiedDiff, IntentSource } from '@devdigest/shared';

/**
 * Pure, presentation-shaped helpers for the intent classifier. No I/O, no
 * drizzle, no fastify — literals live in `constants.ts`, persistence in
 * `repository.ts`.
 *
 * The classifier is a CHEAP pass: it sees WHAT changed (file paths + hunk
 * headers) but never the hunk BODIES. Sending added/removed lines would (a)
 * blow the token budget the flash model exists to save and (b) leak more of the
 * diff into a second LLM call than the feature needs.
 */

/** One changed file reduced to its path + the `@@` header of each hunk. */
export interface HunkHeaders {
  path: string;
  /** One `@@ -a,b +c,d @@` line per hunk — reconstructed, never the body. */
  headers: string[];
}

/**
 * Reduce a unified diff to file paths + hunk headers only.
 *
 * Each header is reconstructed from the parsed `DiffHunk`
 * (`oldStart/oldLines/newStart/newLines`) rather than lifted from `diff.raw`,
 * so the output can NEVER contain an added/removed code line — that guarantee is
 * what makes it safe to feed a cheap classifier (asserted by helpers.test.ts).
 */
export function extractHunkHeaders(diff: UnifiedDiff): HunkHeaders[] {
  return diff.files.map((file) => ({
    path: file.path,
    headers: file.hunks.map(
      (h) => `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
    ),
  }));
}

/**
 * Render the extracted headers as a compact, human/LLM-readable block:
 *   `path`
 *     @@ -a,b +c,d @@
 * Pure formatter — used both in the classifier prompt and the trace log.
 */
export function formatHunkHeaders(files: HunkHeaders[]): string {
  return files
    .map((f) => {
      const lines = f.headers.length > 0 ? f.headers.map((h) => `  ${h}`).join('\n') : '  (no hunks)';
      return `${f.path}\n${lines}`;
    })
    .join('\n');
}

/**
 * Render the source list (issue/plan/spec/etc.) for the trace log, one line per
 * source with its availability. Never includes fetched bodies.
 */
export function formatIntentSources(sources: IntentSource[]): string {
  if (sources.length === 0) return '(none)';
  return sources.map((s) => `- ${s.type}: ${s.ref} [${s.status}]`).join('\n');
}

/**
 * A cheap token estimate (chars / 4) for observability — deliberately NOT a real
 * tokenizer: ring-2 code must not pull a tokenizer dependency in just to log a
 * ballpark number for the intent trace section (plan step 10).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
