/** i18n namespace for the Blast tab (messages/en/blast.json). */
export const NS = "blast" as const;

/** Index states that are NOT `full` and therefore warrant the degraded notice. */
export const INCOMPLETE_INDEX_STATUSES = ["partial", "degraded", "failed"] as const;
