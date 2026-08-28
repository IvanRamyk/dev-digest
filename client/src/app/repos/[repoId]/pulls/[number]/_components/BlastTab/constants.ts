/** i18n namespace for the Blast tab (messages/en/blast.json). */
export const NS = "blast" as const;

/** Index states that are NOT `full` and therefore warrant the degraded notice. */
export const INCOMPLETE_INDEX_STATUSES = ["partial", "degraded", "failed"] as const;

/**
 * HTTP method → chip color tokens. Values are CSS custom-property references
 * (never raw hex, so `styles.ts` stays token-only). Falls back to `DEFAULT`.
 */
export const ENDPOINT_METHOD_TOKENS: Record<string, { color: string; bg: string }> = {
  GET: { color: "var(--info)", bg: "var(--info-bg)" },
  POST: { color: "var(--sugg)", bg: "var(--sugg-bg)" },
  PUT: { color: "var(--warn)", bg: "var(--warn-bg)" },
  PATCH: { color: "var(--warn)", bg: "var(--warn-bg)" },
  DELETE: { color: "var(--crit)", bg: "var(--crit-bg)" },
};

export const ENDPOINT_DEFAULT_TOKENS = { color: "var(--info)", bg: "var(--info-bg)" } as const;

/** Tree-guide glyphs for the caller list (└ for the last row, ├ otherwise). */
export const TREE_BRANCH = "├─" as const;
export const TREE_LAST = "└─" as const;
