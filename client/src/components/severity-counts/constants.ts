import type { Severity } from "@devdigest/shared";

/**
 * Display order for the three severity buckets, worst first.
 *
 * Only the three the shared Zod enum defines (`contracts/findings.ts`). The
 * design system's `Severity` type has a fourth member, `INFO`
 * (`vendor/ui/primitives/tokens.ts`), which no finding can ever carry — it is
 * not in the contract, so the engine cannot produce it.
 */
export const SEVERITY_BUCKETS = ["CRITICAL", "WARNING", "SUGGESTION"] as const satisfies
  readonly Severity[];

/** Em-dash used across the app for "no data" (matches PRRow's unreviewed score). */
export const NO_DATA = "—";
