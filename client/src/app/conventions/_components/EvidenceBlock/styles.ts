import type { CSSProperties } from "react";

export const s = {
  wrap: {
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "6px 8px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  location: {
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  pre: {
    margin: 0,
    padding: "8px 10px",
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: 160,
    overflow: "auto",
  } satisfies CSSProperties,
} as const;
