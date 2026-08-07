"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, TextInput, SelectInput, Textarea, Toggle, Button, Badge } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { approxTokens } from "@/lib/domain/tokens";
import { TYPE_VALUES } from "./constants";
import { s } from "./styles";

/** Config tab — name/description/type/body + enabled toggle. Live token count
 *  and an "unsaved" badge track local edits against the persisted skill. */
export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);

  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty =
    name !== skill.name ||
    description !== skill.description ||
    type !== skill.type ||
    body !== skill.body ||
    enabled !== skill.enabled;

  const typeOptions = TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body, enabled } },
      { onSuccess: (data) => toast.success(t("editor.config.savedToast", { version: data.version })) },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("editor.config.title")}</h2>
        <Badge color="var(--text-secondary)" mono style={s.versionChip}>
          {t("editor.config.version", { version: skill.version })}
        </Badge>
        <label style={s.enabledLabel}>
          {t("editor.config.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>
      <FormField label={t("editor.config.name")} required>
        <TextInput value={name} onChange={setName} />
      </FormField>
      <FormField label={t("editor.config.description")} hint={t("editor.config.descriptionHint")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("editor.config.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField
        label={t("editor.config.body")}
        right={<span style={s.tokenCount}>{t("editor.config.tokenCount", { count: approxTokens(body) })}</span>}
      >
        <Textarea value={body} onChange={setBody} rows={12} mono />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending || !dirty}>
          {update.isPending ? t("editor.config.saving") : t("editor.config.save")}
        </Button>
        {dirty && !update.isPending && <span style={s.unsavedNote}>{t("editor.config.unsaved")}</span>}
        {update.isSuccess && !dirty && (
          <span style={s.savedNote}>{t("editor.config.saved", { version: update.data?.version })}</span>
        )}
      </div>
    </div>
  );
}
