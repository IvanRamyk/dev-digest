import type { IntentConfidence } from "@/lib/types";

/** i18n namespace for this card. */
export const NS = "intent" as const;

/** Confidence badge colour tokens — theme vars, never hex literals (C9/C13). */
export const CONFIDENCE_COLOR: Record<IntentConfidence, { color: string; bg: string }> = {
  high: { color: "var(--ok)", bg: "var(--ok-bg, var(--bg-hover))" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg, var(--bg-hover))" },
  low: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
};

/** Source availability dot colour. */
export const SOURCE_COLOR = {
  available: "var(--ok)",
  missing: "var(--text-muted)",
} as const;
