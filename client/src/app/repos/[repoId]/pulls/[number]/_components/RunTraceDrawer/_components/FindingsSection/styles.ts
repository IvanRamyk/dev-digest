/* Co-located styles for FindingsSection (extracted from inline styles). */
import type { CSSProperties } from "react";

export const s = {
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  } satisfies CSSProperties,
  title: {
    fontSize: 13,
    fontWeight: 600,
  } satisfies CSSProperties,
  fileRef: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  rationale: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,
  suggestion: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    marginTop: 6,
  } satisfies CSSProperties,
} as const;
