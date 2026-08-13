import type { CSSProperties } from "react";

/** Styles for the split-suggestion card. Colours are tokens only (C9). */
export const s = {
  card: {
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    borderRadius: 8,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 600, color: "var(--warn)" } satisfies CSSProperties,
  body: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  splits: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    margin: 0,
    padding: 0,
    listStyle: "none",
  } satisfies CSSProperties,
  split: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  splitName: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  splitFiles: {
    fontSize: 12,
    color: "var(--text-muted)",
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  } satisfies CSSProperties,
} as const;
