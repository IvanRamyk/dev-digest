import type { CSSProperties } from "react";

/** Styles for RunCostBadge. Colour tokens match the surfaces it sits in:
    the PR list's numeric cells and the timeline row's muted meta column. */
export const s = {
  /** Cost on its own. Unknown (em-dash) drops to the muted token so a missing
      figure reads as absent rather than as a small number. */
  cost: (unknown: boolean): CSSProperties => ({
    fontSize: 12,
    color: unknown ? "var(--text-muted)" : "var(--text-secondary)",
  }),
  /** "9,119 tok · $0.0013" on a timeline row — matches the sibling timestamp. */
  usage: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
};
