import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  } satisfies CSSProperties,
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  summary: {
    fontSize: 14,
    color: "var(--text-primary)",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  } satisfies CSSProperties,
  scopeLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  list: {
    margin: 0,
    paddingLeft: 18,
    fontSize: 13,
    color: "var(--text-secondary)",
    lineHeight: 1.6,
  } satisfies CSSProperties,
  sourcesRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  } satisfies CSSProperties,
  missingBox: {
    border: "1px solid var(--warning-border, var(--border))",
    borderRadius: 6,
    background: "var(--bg-hover)",
    padding: 12,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  missingList: {
    margin: "6px 0 0",
    paddingLeft: 18,
  } satisfies CSSProperties,
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
