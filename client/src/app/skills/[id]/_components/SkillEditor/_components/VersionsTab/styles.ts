import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab. */
export const s = {
  wrap: { maxWidth: 780, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  versionChip: { fontSize: 13, fontWeight: 700 } satisfies CSSProperties,
  date: { fontSize: 12, color: "var(--text-muted)", flex: 1 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  diffWrap: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
    marginTop: 16,
  } satisfies CSSProperties,
  diffTitle: { fontSize: 12, fontWeight: 700, color: "var(--text-muted)", marginBottom: 6 } satisfies CSSProperties,
  diffBody: {
    fontSize: 13,
    lineHeight: 1.5,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    maxHeight: 320,
    overflow: "auto",
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
} as const;
