/* /skills/:id — Skill Editor. Left skill list + Config/Preview/Versions editor.
   Tab state lives in ?tab=, copied from agents/[id]/page.tsx. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { SkillCard } from "@/components/skill-card";
import { SkillEditor } from "./_components/SkillEditor";
import { useSkills, useSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { ApiError } from "@/lib/api";
import { s } from "./styles";

const VALID_TABS = ["config", "preview", "versions"];

export default function SkillEditorPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { id } = params;
  const t = useTranslations("skills");

  const { data: skills } = useSkills();
  const { data: skill, isLoading, isError, error, refetch } = useSkill(id);
  const update = useUpdateSkill();

  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("editor.skillFallback") },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("editor.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("editor.loadErrorBody")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        {/* left: skill list */}
        <div style={s.sidebar}>
          <div style={s.sidebarHeader}>
            <div style={s.sidebarTitleRow}>
              <h1 style={s.sidebarTitle}>{t("editor.listTitle")}</h1>
              <Button kind="primary" size="sm" icon="Plus" onClick={() => router.push("/skills")}>
                {t("editor.add")}
              </Button>
            </div>
          </div>
          <div style={s.skillList}>
            {(skills ?? []).map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === id}
                onClick={() => router.push(`/skills/${sk.id}?tab=${tab}`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {/* editor */}
        {isLoading || !skill ? (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={s.editorPane}>
            <div style={s.editorHeader}>
              <Icon.Sparkles size={18} style={s.editorIcon} />
              <h1 style={s.editorTitle}>{skill.name}</h1>
              <Badge color="var(--text-secondary)">{t(`listItem.type.${skill.type}`)}</Badge>
              {!skill.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
            </div>
            <div style={s.editorBody}>
              <SkillEditor skill={skill} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
