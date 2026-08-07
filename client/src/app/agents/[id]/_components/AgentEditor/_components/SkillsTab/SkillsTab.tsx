/* SkillsTab — every workspace skill with a checkbox reflecting membership in
   GET /agents/:id/skills, an "N of M enabled" count, type badges, and
   move-up/move-down reordering (no DnD library in the client). Checking or
   reordering persists immediately via a single POST /agents/:id/skills. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox, Badge, IconBtn, Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useSkills } from "@/lib/hooks/skills";
import { useAgentSkills, useSetAgentSkills } from "@/lib/hooks/agents";
import { SKILL_TYPE_COLOR } from "@/lib/domain/skills";
import { reorder, toggleLinked } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const tSkills = useTranslations("skills");
  const { data: skills } = useSkills();
  const { data: links } = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills();

  const linkedIds = React.useMemo(() => (links ?? []).map((l) => l.skill_id), [links]);
  const linkedSet = new Set(linkedIds);
  const byId = new Map((skills ?? []).map((sk) => [sk.id, sk]));

  const unlinked = (skills ?? []).filter((sk) => !linkedSet.has(sk.id));
  const total = skills?.length ?? 0;

  const persist = (ids: string[]) => setSkills.mutate({ id: agent.id, skillIds: ids });

  const move = (index: number, dir: -1 | 1) => persist(reorder(linkedIds, index, index + dir));
  const toggle = (skillId: string) => persist(toggleLinked(linkedIds, skillId));

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.enabledCount", { linked: linkedIds.length, total })}</span>
      </div>
      <div style={s.hint}>{t("skills.orderHint")}</div>

      {total === 0 ? (
        <div style={s.empty}>{tSkills("page.empty.title")}</div>
      ) : (
        <div style={s.list}>
          {linkedIds.map((skillId, i) => {
            const sk = byId.get(skillId);
            if (!sk) return null;
            return (
              <div key={sk.id} style={s.row}>
                <Checkbox checked onChange={() => toggle(sk.id)} />
                <Icon.Menu size={14} style={{ color: "var(--text-muted)" }} />
                <span style={s.name}>{sk.name}</span>
                <Badge color={SKILL_TYPE_COLOR[sk.type]}>{tSkills(`listItem.type.${sk.type}`)}</Badge>
                <div style={s.orderCol}>
                  <IconBtn
                    icon="ArrowUp"
                    label={t("skills.moveUp")}
                    size={20}
                    onClick={() => move(i, -1)}
                  />
                  <IconBtn
                    icon="ArrowDown"
                    label={t("skills.moveDown")}
                    size={20}
                    onClick={() => move(i, 1)}
                  />
                </div>
              </div>
            );
          })}
          {unlinked.map((sk) => (
            <div key={sk.id} style={s.row}>
              <Checkbox checked={false} onChange={() => toggle(sk.id)} />
              <span style={s.name}>{sk.name}</span>
              <Badge color={SKILL_TYPE_COLOR[sk.type]}>{tSkills(`listItem.type.${sk.type}`)}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
