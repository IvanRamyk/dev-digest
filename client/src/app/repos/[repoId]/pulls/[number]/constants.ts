/* Route-level constants for the PR detail page — shared by more than one of its
   _components (C12: promoted out of VerdictBanner when the accordion needed it). */
import type { IconName } from "@devdigest/ui";
import type { Verdict } from "@devdigest/shared";

/** Per-verdict visual meta. `labelKey` resolves under the `verdict` namespace.
    Declared once (C13) — the accordion and the banner must not disagree about
    what "comment" looks like. */
export const VERDICT_META: Record<
  Verdict,
  { c: string; bg: string; icon: IconName; labelKey: string }
> = {
  request_changes: {
    c: "var(--crit)",
    bg: "var(--crit-bg)",
    icon: "XCircle",
    labelKey: "requestChanges",
  },
  approve: { c: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle", labelKey: "approve" },
  comment: { c: "var(--info)", bg: "var(--info-bg)", icon: "MessageSquare", labelKey: "comment" },
};

/** Fallback when `verdict` is absent (a run that never produced one). */
export const VERDICT_FALLBACK_COLOR = "var(--text-muted)";
