import type { CSSProperties } from "react";

/** Co-located styles for SkillsTab. */
export const s = {
  wrap: { maxWidth: 640 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 8, gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  filter: { marginBottom: 14 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600, flex: 1 } satisfies CSSProperties,
  orderCol: { display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
