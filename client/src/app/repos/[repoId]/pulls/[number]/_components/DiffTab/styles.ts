import type { CSSProperties } from "react";

/** Co-located styles for the DiffTab header controls. Layout only. */
export const s = {
  controls: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  orderToggle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
} as const;
