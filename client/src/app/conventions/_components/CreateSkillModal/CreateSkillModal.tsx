/* CreateSkillModal — prefills from POST skill-preview (fired on open, so the
   preview reflects the latest inline edits), everything stays local + editable,
   Save persists through the EXISTING useCreateSkill hook. No new write path. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, SelectInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "@/lib/hooks/skills";
import { useConventionSkillPreview } from "@/lib/hooks/conventions";
import { s } from "./styles";

const SKILL_TYPES: SkillType[] = ["convention", "rubric", "security", "custom"];

export function CreateSkillModal({
  repoId,
  onClose,
  onCreated,
}: {
  repoId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("conventions");
  const preview = useConventionSkillPreview(repoId);
  const createSkill = useCreateSkill();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("convention");
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState("");
  const [candidateCount, setCandidateCount] = React.useState(0);

  React.useEffect(() => {
    if (!repoId) return;
    preview.mutate(undefined, {
      onSuccess: (dto) => {
        setName(dto.name);
        setDescription(dto.description);
        setBody(dto.body);
        setCandidateCount(dto.candidate_count);
      },
    });
    // Fire exactly once on open — re-running on every render would clobber edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId]);

  const save = () => {
    createSkill.mutate(
      { name, description, type, body, enabled },
      { onSuccess: () => onCreated() },
    );
  };

  return (
    <Modal
      title={t("modal.title")}
      subtitle={t("modal.subtitle", { count: candidateCount })}
      onClose={onClose}
      width={720}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="primary"
            loading={createSkill.isPending}
            disabled={preview.isPending || name.trim().length === 0 || body.trim().length === 0}
            onClick={save}
          >
            {createSkill.isPending ? t("modal.saving") : t("modal.save")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <label style={s.field}>
          <span style={s.label}>{t("modal.name")}</span>
          <input
            className="mono"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={s.input}
            aria-label={t("modal.name")}
          />
        </label>
        <label style={s.field}>
          <span style={s.label}>{t("modal.description")}</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={s.input}
            aria-label={t("modal.description")}
          />
        </label>
        <div style={s.row}>
          <label style={s.field}>
            <span style={s.label}>{t("modal.type")}</span>
            <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={SKILL_TYPES} />
          </label>
          <label style={s.enabledField}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              aria-label={t("modal.enabled")}
            />
            <span style={s.label}>{t("modal.enabled")}</span>
          </label>
        </div>
        <label style={s.field}>
          <span style={s.label}>{t("modal.body")}</span>
          <Textarea value={body} onChange={setBody} rows={14} mono />
        </label>
      </div>
    </Modal>
  );
}
