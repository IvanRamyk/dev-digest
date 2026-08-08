import type { CSSProperties } from "react";

export const s = {
  body: { display: "flex", flexDirection: "column", gap: 14, padding: 20 } satisfies CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 6, flex: 1 } satisfies CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  input: {
    padding: "9px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 14,
    outline: "none",
  } satisfies CSSProperties,
  row: { display: "flex", gap: 14, alignItems: "flex-end" } satisfies CSSProperties,
  enabledField: { display: "flex", alignItems: "center", gap: 8, paddingBottom: 9 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
