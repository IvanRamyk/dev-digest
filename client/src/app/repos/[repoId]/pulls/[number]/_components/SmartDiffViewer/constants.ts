/* SmartDiffViewer constants — role presentation + open-state defaults.
   Colours are existing tokens; user-visible strings are labelKeys only (C10). */
import type { SmartDiffRole } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Per-role header presentation. `c`/`bg` are tokens (never hex); `labelKey` and
    `captionKey` resolve through `useTranslations("prReview.smartDiff")`. */
export const ROLE_META: Record<
  SmartDiffRole,
  { c: string; bg: string; icon: IconName; labelKey: string; captionKey: string }
> = {
  core: {
    c: "var(--crit)",
    bg: "var(--crit-bg)",
    icon: "Cpu",
    labelKey: "coreLabel",
    captionKey: "coreCaption",
  },
  wiring: {
    c: "var(--warn)",
    bg: "var(--warn-bg)",
    icon: "Wrench",
    labelKey: "wiringLabel",
    captionKey: "wiringCaption",
  },
  boilerplate: {
    c: "var(--text-muted)",
    bg: "var(--bg-hover)",
    icon: "Boxes",
    labelKey: "boilerplateLabel",
    captionKey: "boilerplateCaption",
  },
};

/** Roles whose files start expanded. Any file with findings expands regardless. */
export const DEFAULT_EXPANDED_ROLES: readonly SmartDiffRole[] = ["core"];
