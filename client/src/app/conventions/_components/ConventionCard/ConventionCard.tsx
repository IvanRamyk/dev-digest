/* ConventionCard — rule text (click-to-edit), evidence, confidence bar,
   Accept/Reject, and a verification chip that says WHICH machine checked it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ConfidenceNum, Icon, ProgressBar, Textarea } from "@devdigest/ui";
import type { ConventionCandidate } from "@/lib/types";
import { EvidenceBlock } from "../EvidenceBlock";
import { VERIFICATION_COLOR, VERIFICATION_ICON } from "./constants";
import { s } from "./styles";

export function ConventionCard({
  candidate,
  onAccept,
  onReject,
  onSaveRule,
}: {
  candidate: ConventionCandidate;
  onAccept: () => void;
  onReject: () => void;
  onSaveRule: (rule: string) => void;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(candidate.rule);

  const startEdit = () => {
    setDraft(candidate.rule);
    setEditing(true);
  };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    if (draft.trim().length > 0) onSaveRule(draft.trim());
    setEditing(false);
  };

  const VIcon = Icon[VERIFICATION_ICON[candidate.verification]];
  const vColor = VERIFICATION_COLOR[candidate.verification];

  return (
    <div style={s.card(candidate.status)}>
      <div style={s.topRow}>
        <Badge>{candidate.category}</Badge>
        <Badge color={vColor} icon={VERIFICATION_ICON[candidate.verification]}>
          {candidate.verification === "pattern"
            ? t("card.verification.pattern", { support: candidate.support_count, violation: candidate.violation_count })
            : candidate.verification === "semantic"
              ? t("card.verification.semantic", {
                  total: candidate.support_count + candidate.violation_count,
                  support: candidate.support_count,
                  violation: candidate.violation_count,
                })
              : t(`card.verification.${candidate.verification}`)}
        </Badge>
        {candidate.status === "accepted" && (
          <Badge color="var(--ok)" icon="CheckCircle">
            {t("card.accepted")}
          </Badge>
        )}
      </div>

      {editing ? (
        <div style={s.editRow}>
          <Textarea
            value={draft}
            onChange={setDraft}
            rows={3}
            placeholder={candidate.rule}
          />
          <div style={s.editActions}>
            <Button kind="ghost" size="sm" onClick={cancelEdit}>
              {t("card.cancel")}
            </Button>
            <Button kind="primary" size="sm" onClick={saveEdit}>
              {t("card.save")}
            </Button>
          </div>
        </div>
      ) : (
        <div
          style={s.rule}
          onClick={startEdit}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancelEdit();
          }}
          role="button"
          tabIndex={0}
          title={t("card.edit")}
        >
          {candidate.rule}
        </div>
      )}

      <EvidenceBlock
        path={candidate.evidence_path}
        startLine={candidate.evidence_start_line}
        endLine={candidate.evidence_end_line}
        snippet={candidate.evidence_snippet}
      />

      <div style={s.confidenceRow}>
        <span style={s.confidenceLabel}>{t("card.confidence")}</span>
        <div style={s.confidenceBar}>
          <ProgressBar
            value={candidate.confidence * 100}
            color={candidate.verification === "unverified" ? "var(--text-muted)" : undefined}
          />
        </div>
        <ConfidenceNum value={candidate.confidence} />
      </div>

      <div style={s.actions}>
        {candidate.status === "pending" && (
          <>
            <Button kind="secondary" size="sm" icon="X" onClick={onReject}>
              {t("card.reject")}
            </Button>
            <Button kind="primary" size="sm" icon="Check" onClick={onAccept}>
              {t("card.accept")}
            </Button>
          </>
        )}
        {candidate.status === "accepted" && (
          <Button kind="ghost" size="sm" onClick={onReject}>
            {t("card.reject")}
          </Button>
        )}
        {candidate.status === "rejected" && (
          <Button kind="ghost" size="sm" onClick={onAccept}>
            {t("card.accept")}
          </Button>
        )}
      </div>
    </div>
  );
}
