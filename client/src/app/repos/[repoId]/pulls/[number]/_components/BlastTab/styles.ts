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

  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "8px 0",
  } satisfies CSSProperties,

  degradedNotice: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    border: "1px solid var(--warn)",
    borderRadius: 8,
    background: "var(--warn-bg, var(--bg-hover))",
    color: "var(--text-secondary)",
    padding: "10px 12px",
    fontSize: 13,
  } satisfies CSSProperties,

  degradedReason: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  summary: {
    fontSize: 14,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
  } satisfies CSSProperties,

  symbolBlock: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg)",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,

  symbolHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,

  symbolName: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  callerList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,

  callerRow: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    fontSize: 12.5,
  } satisfies CSSProperties,

  callerName: {
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  callerLink: {
    color: "var(--accent)",
    textDecoration: "none",
  } satisfies CSSProperties,

  chipRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    alignItems: "center",
  } satisfies CSSProperties,

  chipLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  sectionLabelRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,

  priorPrs: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
