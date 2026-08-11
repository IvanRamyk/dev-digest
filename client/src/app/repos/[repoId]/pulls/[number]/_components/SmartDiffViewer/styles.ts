import type { CSSProperties } from "react";

/** Co-located styles for the SmartDiffViewer. Colours are tokens only (C9). */
export const s = {
  root: { display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
  empty: {
    padding: "24px",
    fontSize: 14,
    color: "var(--text-muted)",
    textAlign: "center",
  } satisfies CSSProperties,
} as const;
