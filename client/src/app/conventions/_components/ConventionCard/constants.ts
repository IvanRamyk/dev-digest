import type { ConventionVerification } from "@/lib/types";
import type { IconName } from "@devdigest/ui";

export const VERIFICATION_ICON: Record<ConventionVerification, IconName> = {
  config: "Wrench",
  pattern: "Code",
  semantic: "Brain",
  unverified: "AlertTriangle",
};

export const VERIFICATION_COLOR: Record<ConventionVerification, string> = {
  config: "var(--text-muted)",
  pattern: "var(--ok, var(--accent))",
  semantic: "var(--accent)",
  unverified: "var(--warn)",
};
