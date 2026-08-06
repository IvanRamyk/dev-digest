import type { CSSProperties } from "react";

/** Styles for SeverityCounts. The "chips" row is sized for a dense table cell;
    the "counters" row sits in a toolbar beside a Toggle. */
export const s = {
  /** Non-interactive icon+count chips (PR list cell, timeline row). */
  chipRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12.5,
  } satisfies CSSProperties,
  chip: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    color,
  }),
  /** Interactive Chip toggles (a run's findings toolbar). */
  counterRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    fontSize: 11.5,
  } satisfies CSSProperties,
  /** "Never reviewed" — muted so an absent figure reads as absent. */
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  /** "Reviewed, and clean" — a real result, so it gets the OK colour, not a dash. */
  clean: {
    display: "inline-flex",
    alignItems: "center",
    color: "var(--ok)",
  } satisfies CSSProperties,
};
