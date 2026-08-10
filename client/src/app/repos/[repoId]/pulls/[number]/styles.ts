/* Route-level styles for the PR detail page (extracted from inline styles). */
import type { CSSProperties } from "react";

export const s = {
  loading: {
    padding: "28px 32px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    maxWidth: 1080,
    margin: "0 auto",
  } satisfies CSSProperties,
  body: {
    padding: "24px 32px 44px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
    maxWidth: 1080,
    margin: "0 auto",
  } satisfies CSSProperties,
} as const;
