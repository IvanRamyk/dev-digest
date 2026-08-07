/** Constants for the skills module. */

/** Heuristic patterns used to infer a skill's type from its name/body. */
export const TYPE_PATTERNS = {
  security: /secret|trifecta|injection|ssrf|exfil|security|vuln/,
  convention: /convention|naming|style|house rule|lint/,
  rubric: /rubric|score|grade|severity/,
} as const;

/** Fallback skill name when none can be derived. */
export const DEFAULT_SKILL_NAME = 'imported-skill';

/** Max length for a derived skill name / first-line description. */
export const NAME_MAX_LEN = 200;

/** Archive import caps (decompression-bomb / zip-slip guards). */
export const ARCHIVE_MAX_ENTRIES = 200;
export const ARCHIVE_MAX_ENTRY_BYTES = 1_048_576; // 1 MB per entry, uncompressed
export const ARCHIVE_MAX_TOTAL_BYTES = 2_097_152; // 2 MB total, uncompressed

/** Body limit for the two import routes (base64 JSON payload can carry a small zip). */
export const IMPORT_BODY_LIMIT_BYTES = 4_194_304; // 4 MB
