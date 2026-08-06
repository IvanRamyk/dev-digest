/** Constants for FindingsHoverCard. */

/** Findings listed before collapsing the rest into "+N more". */
export const POPOVER_MAX_ITEMS = 5;

/** Card width — wide enough for a title + file:line on one line each. */
export const POPOVER_WIDTH = 380;

/** Gap between the anchor and the card, in px. */
export const POPOVER_OFFSET = 6;

/** Rationale is a preview here, not the whole thing — the card links to the PR. */
export const RATIONALE_MAX_CHARS = 150;

/** Sort weight per severity (lower = shown first), worst finding at the top. */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};
