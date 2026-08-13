import type { CSSProperties } from "react";

/** Styles for one role group section. Colours are tokens only (C9). */
export const s = {
  section: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  headIcon: (color: string): CSSProperties => ({ color, flexShrink: 0 }),
  label: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  caption: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  summary: {
    marginLeft: "auto",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  files: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  jumpBtn: {
    display: "inline-flex",
    alignItems: "center",
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
  } satisfies CSSProperties,
} as const;
