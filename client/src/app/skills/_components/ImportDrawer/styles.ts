import type { CSSProperties } from "react";

/** Co-located styles for ImportDrawer. */
export const s = {
  dropzone: (dragging: boolean): CSSProperties => ({
    border: "1.5px dashed " + (dragging ? "var(--accent)" : "var(--border-strong)"),
    borderRadius: 10,
    padding: "36px 20px",
    textAlign: "center",
    background: dragging ? "var(--bg-hover)" : "var(--bg-elevated)",
    cursor: "pointer",
  }),
  dropzoneText: { fontSize: 13, color: "var(--text-secondary)", marginTop: 10 } satisfies CSSProperties,
  hiddenInput: { display: "none" } satisfies CSSProperties,
  section: { marginTop: 20 } satisfies CSSProperties,
  previewHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } satisfies CSSProperties,
  previewName: { fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  previewBody: {
    fontSize: 13,
    lineHeight: 1.55,
    maxHeight: 220,
    overflow: "auto",
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  skippedList: { display: "flex", flexDirection: "column", gap: 4, marginTop: 8 } satisfies CSSProperties,
  skippedRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  notice: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: 14,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginTop: 10 } satisfies CSSProperties,
} as const;
