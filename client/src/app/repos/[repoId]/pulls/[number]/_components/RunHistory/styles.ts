/* Co-located styles for RunHistory (extracted from inline styles). */
import type { CSSProperties } from "react";

export const s = {
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,

  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    textAlign: "left",
  } satisfies CSSProperties,

  // Commits are markers, not actions — lighter (dashed, transparent) so they read
  // as separators between the runs they sit chronologically between.
  commitRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px dashed var(--border)",
    background: "transparent",
  } satisfies CSSProperties,

  commitIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  commitSha: { fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 } satisfies CSSProperties,
  commitMessage: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  meta: { fontSize: 11, color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,

  main: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  agentLine: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  /** The agent name is a button only when a jump target exists. */
  agentButton: (clickable: boolean): CSSProperties => ({
    background: "none",
    border: "none",
    padding: 0,
    font: "inherit",
    fontWeight: 600,
    color: "var(--text-primary)",
    cursor: clickable ? "pointer" : "default",
    textDecoration: clickable ? "underline" : "none",
    textDecorationStyle: "dotted",
    textUnderlineOffset: 3,
  }),
  modelRef: {
    fontSize: 12,
    fontWeight: 400,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  error: {
    fontSize: 12,
    color: "var(--crit)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  counts: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  aside: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 2,
    fontSize: 11,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
    borderRadius: 5,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "var(--text-muted)",
    cursor: "pointer",
    flexShrink: 0,
  } satisfies CSSProperties,
  deleteBtn: {
    display: "inline-flex",
    padding: 3,
    borderRadius: 5,
    color: "var(--text-muted)",
    flexShrink: 0,
    cursor: "pointer",
  } satisfies CSSProperties,
} as const;
