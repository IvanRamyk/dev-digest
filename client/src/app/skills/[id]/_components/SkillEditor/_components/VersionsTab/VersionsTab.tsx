"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillVersions, useRestoreSkillVersion } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { formatVersionDate } from "./helpers";
import { s } from "./styles";

/** Versions tab — v1…vN with dates, Restore, and a plain two-column body
 *  comparison against the current version (no diff library, per the plan). */
export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [compare, setCompare] = React.useState<number | null>(null);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={40} />
        <Skeleton height={40} />
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return <div style={s.empty}>{t("editor.versions.empty")}</div>;
  }

  const compared = compare != null ? versions.find((v) => v.version === compare) : undefined;

  return (
    <div style={s.wrap}>
      {versions.map((v) => (
        <div key={v.version} style={s.row}>
          <span style={s.versionChip}>{t("editor.config.version", { version: v.version })}</span>
          {v.version === skill.version && <Badge color="var(--ok)">{t("editor.versions.current")}</Badge>}
          <span style={s.date}>{formatVersionDate(v.created_at)}</span>
          <Button
            kind="secondary"
            size="sm"
            onClick={() => setCompare(compare === v.version ? null : v.version)}
          >
            {t("editor.versions.diffTitle")}
          </Button>
          {v.version !== skill.version && (
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              disabled={restore.isPending}
              onClick={() =>
                restore.mutate(
                  { id: skill.id, version: v.version },
                  {
                    onSuccess: (data) =>
                      toast.success(
                        t("editor.versions.restored", { version: v.version, newVersion: data.version }),
                      ),
                  },
                )
              }
            >
              {restore.isPending ? t("editor.versions.restoring") : t("editor.versions.restore")}
            </Button>
          )}
        </div>
      ))}

      {compared && (
        <div style={s.diffWrap}>
          <div>
            <div style={s.diffTitle}>{t("editor.config.version", { version: compared.version })}</div>
            <div style={s.diffBody}>{compared.body}</div>
          </div>
          <div>
            <div style={s.diffTitle}>{t("editor.versions.current")}</div>
            <div style={s.diffBody}>{skill.body}</div>
          </div>
        </div>
      )}
    </div>
  );
}
