import type { CSSProperties } from "react";
import { CARD_GRID_COLS } from "./constants";

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1200, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 8, flexWrap: "wrap" } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 240 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  headerActions: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: 12,
    color: "var(--text-muted)",
    marginBottom: 18,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: CARD_GRID_COLS, gap: 14 } satisfies CSSProperties,
  divider: {
    gridColumn: "1 / -1",
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "6px 0",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  dividerLine: { flex: 1, height: 1, background: "var(--border)" } satisfies CSSProperties,
} as const;
