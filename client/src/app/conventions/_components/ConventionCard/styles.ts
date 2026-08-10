import type { CSSProperties } from "react";
import type { ConventionStatus } from "@/lib/types";

export const s = {
  card: (status: ConventionStatus) =>
    ({
      display: "flex",
      flexDirection: "column",
      gap: 10,
      padding: 14,
      borderRadius: 8,
      border: "1px solid var(--border)",
      background: "var(--bg-elevated)",
      opacity: status === "rejected" ? 0.55 : 1,
    }) satisfies CSSProperties,
  topRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  rule: {
    fontSize: 14,
    lineHeight: 1.5,
    color: "var(--text-primary)",
    cursor: "pointer",
    padding: "2px 4px",
    borderRadius: 4,
  } satisfies CSSProperties,
  editRow: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  editActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  } satisfies CSSProperties,
  confidenceRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  confidenceLabel: {
    fontSize: 12,
    color: "var(--text-muted)",
    minWidth: 68,
  } satisfies CSSProperties,
  confidenceBar: {
    flex: 1,
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  } satisfies CSSProperties,
} as const;
