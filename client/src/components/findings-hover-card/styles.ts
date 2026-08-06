import type { CSSProperties } from "react";
import { POPOVER_WIDTH } from "./constants";

/** Styles for FindingsHoverCard. The card is portalled to <body> and positioned
    with `fixed` coordinates, so it carries its own elevation and z-index. */
export const s = {
  /** Inline wrapper around the anchor — must not disturb the host layout. */
  anchor: { display: "inline-flex", alignItems: "center" } satisfies CSSProperties,
  card: (top: number, left: number): CSSProperties => ({
    position: "fixed",
    top,
    left,
    width: POPOVER_WIDTH,
    zIndex: 60,
    padding: "10px 0",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    boxShadow: "0 12px 32px rgba(0,0,0,0.32)",
    pointerEvents: "none",
  }),
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "0 14px 8px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    maxHeight: 420,
    overflow: "hidden",
  } satisfies CSSProperties,
  item: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "8px 14px",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  itemTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  itemIcon: (color: string): CSSProperties => ({ color, flexShrink: 0 }),
  itemTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  itemMetaRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 12,
  } satisfies CSSProperties,
  itemFile: {
    fontSize: 12,
    color: "var(--accent-text)",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  itemRationale: {
    fontSize: 12,
    lineHeight: 1.45,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  footer: {
    padding: "8px 14px 0",
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  empty: {
    padding: "0 14px",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
};
