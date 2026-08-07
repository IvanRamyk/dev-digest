import type { CSSProperties } from "react";

/** Co-located styles for ConfigTab — mirrors agents' ConfigTab. */
export const s = {
  wrap: { maxWidth: 640 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", marginBottom: 20, gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  enabledLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  versionChip: { marginLeft: 8 } satisfies CSSProperties,
  tokenCount: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 12, marginTop: 8 } satisfies CSSProperties,
  savedNote: { fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
  unsavedNote: { fontSize: 12, color: "var(--warn)" } satisfies CSSProperties,
} as const;
