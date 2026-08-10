/* domain/skills.ts — skill type → badge colour. Pure.

   Two consumers (src/components/skill-card, AgentEditor's SkillsTab) is what
   promotes this out of a colocated constants.ts (C12); a single map declared
   once avoids the severity/colour drift C13 warns about. */
import type { SkillType } from "@devdigest/shared";

export const SKILL_TYPE_COLOR: Record<SkillType, string> = {
  security: "var(--crit)",
  convention: "var(--text-secondary)",
  rubric: "var(--accent)",
  custom: "var(--text-muted)",
};
