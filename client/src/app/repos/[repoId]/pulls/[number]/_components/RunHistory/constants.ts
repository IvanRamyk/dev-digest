/* Constants for RunHistory. */
import type { IconName } from "@devdigest/ui";
import type { RunOutcome } from "@/lib/domain/runs";

/** Presentation for each outcome the domain rule can return (C13: the rule lives
    in lib/domain/runs.ts; only colour/icon are decided here). `key` is the i18n
    lookup under `prReview.runStatus.*`. */
export const OUTCOME_META: Record<
  RunOutcome,
  { color: string; bg: string; icon: IconName }
> = {
  running: { color: "var(--accent)", bg: "var(--accent-bg)", icon: "RefreshCw" },
  error: { color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" },
  cancelled: { color: "var(--text-muted)", bg: "var(--bg-hover)", icon: "X" },
  rejected: { color: "var(--crit)", bg: "var(--crit-bg)", icon: "XCircle" },
  reviewed: { color: "var(--warn)", bg: "var(--warn-bg)", icon: "MessageSquare" },
  approved: { color: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle" },
};

/** Short sha length shown for a commit row. */
export const SHA_LENGTH = 7;
