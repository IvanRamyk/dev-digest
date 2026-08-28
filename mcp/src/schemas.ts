/**
 * Per-tool input schemas — flat Zod raw shapes handed to `registerTool`.
 *
 * Design (per plan §4 / the `zod` skill):
 *  - Flat args only (no nested objects): `repo="owner/name"`, `pr=<number>`, etc.
 *  - `.describe()` only where the meaning is non-obvious (repo format, run_id
 *    provenance) — descriptions cost tokens on every `tools/list`.
 *  - `response_format` / `severity` / `status` are `z.string()`, NOT z.enum():
 *    enums balloon the serialized schema (token budget). They are validated at
 *    runtime in `_shared.ts` and taught via error-forward messages.
 *
 * Each export is a raw shape (`ZodRawShape`); the SDK builds the JSON Schema and
 * parses incoming args against it before invoking the handler.
 */
import { z } from 'zod';

/** `owner/name`, `pr`, and the shared shaping controls used by review-read tools. */
const repoField = z
  .string()
  .describe('GitHub repository as "owner/name", e.g. "vercel/next.js".');
const prField = z.number().int().positive().describe('Pull request number (as shown on GitHub).');
const responseFormatField = z
  .string()
  .optional()
  .describe('"concise" (default) or "detailed". Invalid values fall back to concise.');
const severityField = z
  .string()
  .optional()
  .describe('Optional minimum severity filter: "CRITICAL", "WARNING", or "SUGGESTION".');

/** `devdigest_list_agents` — no inputs. */
export const listAgentsShape = {} as const;

/** `devdigest_run_agent_on_pr`. */
export const runAgentOnPrShape = {
  repo: repoField,
  pr: prField,
  agent: z.string().describe('Review agent name (exact or case-insensitive). See devdigest_list_agents.'),
  response_format: responseFormatField,
  severity: severityField,
  max_wait_ms: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Max time to block waiting for the run before returning status:"running".'),
} as const;

/** `devdigest_get_findings`. */
export const getFindingsShape = {
  run_id: z
    .string()
    .optional()
    .describe('Run id from a prior devdigest_run_agent_on_pr call (this process only). Or pass repo + pr.'),
  repo: repoField.optional(),
  pr: prField.optional(),
  response_format: responseFormatField,
  severity: severityField,
  all_runs: z
    .boolean()
    .optional()
    .describe('Include every run\'s review, not just the latest. Ignored when run_id is set.'),
} as const;

/** `devdigest_get_conventions`. */
export const getConventionsShape = {
  repo: repoField,
  status: z
    .string()
    .optional()
    .describe('Convention status filter: "accepted" (default), "pending", "rejected", or "all".'),
} as const;

/** `devdigest_get_blast_radius` (stub, gated). */
export const getBlastRadiusShape = {
  repo: repoField,
  pr: prField,
} as const;
