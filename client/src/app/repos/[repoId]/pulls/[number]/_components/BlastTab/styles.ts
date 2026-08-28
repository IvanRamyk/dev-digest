import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,

  /* ---- header: section label + view toggle ---- */
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,

  viewToggle: {
    display: "inline-flex",
    padding: 2,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-primary)",
    gap: 2,
  } satisfies CSSProperties,

  viewBtn: {
    border: "none",
    background: "transparent",
    color: "var(--text-muted)",
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 12px",
    borderRadius: 6,
    cursor: "pointer",
    lineHeight: 1.4,
  } satisfies CSSProperties,

  viewBtnActive: {
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-strong)",
    padding: "3px 11px",
  } satisfies CSSProperties,

  viewBtnDisabled: {
    color: "var(--text-muted)",
    opacity: 0.5,
    cursor: "not-allowed",
  } satisfies CSSProperties,

  /* ---- stats strip ---- */
  statsRow: {
    display: "flex",
    alignItems: "center",
    gap: 18,
    flexWrap: "wrap",
    paddingBottom: 4,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,

  statItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  statNum: {
    fontSize: 14,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  statLabel: {
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  /* ---- degraded / summary ---- */
  degradedNotice: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    border: "1px solid var(--warn)",
    borderRadius: 8,
    background: "var(--warn-bg)",
    color: "var(--text-secondary)",
    padding: "10px 12px",
    fontSize: 13,
  } satisfies CSSProperties,

  degradedReason: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  summary: {
    fontSize: 13.5,
    color: "var(--text-secondary)",
    lineHeight: 1.55,
    background: "var(--bg-primary)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
  } satisfies CSSProperties,

  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "8px 0",
  } satisfies CSSProperties,

  /* ---- symbol card ---- */
  symbolBlock: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-primary)",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,

  symbolHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,

  symbolNameWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    color: "var(--accent)",
  } satisfies CSSProperties,

  symbolName: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  callerCount: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  /* ---- caller tree ---- */
  callerList: {
    listStyle: "none",
    margin: 0,
    padding: "0 0 0 6px",
    display: "flex",
    flexDirection: "column",
    gap: 3,
  } satisfies CSSProperties,

  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
  } satisfies CSSProperties,

  treeGuide: {
    color: "var(--text-muted)",
    opacity: 0.7,
    userSelect: "none",
  } satisfies CSSProperties,

  callerLink: {
    color: "var(--text-secondary)",
    textDecoration: "none",
    borderBottom: "1px dotted var(--border-strong)",
  } satisfies CSSProperties,

  callerPlain: {
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  /* ---- chip rows ---- */
  chipRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    alignItems: "center",
  } satisfies CSSProperties,

  noDownstream: {
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  /* ---- prior PRs footer ---- */
  priorPrsRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-primary)",
    color: "var(--text-secondary)",
    fontSize: 13,
  } satisfies CSSProperties,

  priorPrsLabel: {
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  priorPrsNote: {
    marginLeft: "auto",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
