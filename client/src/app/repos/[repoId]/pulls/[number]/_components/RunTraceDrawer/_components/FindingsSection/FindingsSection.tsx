/* FindingsSection — the persisted findings of THIS run (same data as the
   "Review runs" list), rendered inside a collapsible TraceSection. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, SEV, type Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { s as trace } from "../../styles";
import { TraceSection } from "../TraceSection";
import { s } from "./styles";

/** Severity colour comes from the design system's SEV (C13) — a local copy here
    is how SUGGESTION once rendered var(--accent) while every other surface used
    var(--sugg). `severity` is free-form text, hence the fallback. */
function severityColor(severity: string): string {
  return SEV[severity as Severity]?.c ?? "var(--text-muted)";
}

export function FindingsSection({ findings }: { findings: FindingRecord[] }) {
  const t = useTranslations("runs");
  return (
    <TraceSection
      icon="AlertOctagon"
      title={t("trace.findings")}
      right={<Badge color="var(--text-muted)">{findings.length}</Badge>}
    >
      {findings.length === 0 ? (
        <span style={trace.noToolCalls}>{t("trace.noFindings")}</span>
      ) : (
        <div style={s.list}>
          {findings.map((f) => (
            <div key={f.id} style={s.card}>
              <div style={s.cardHeader}>
                <Badge color={severityColor(f.severity)} bg="transparent">
                  {f.severity}
                </Badge>
                <span style={s.title}>{f.title}</span>
              </div>
              <div className="mono" style={s.fileRef}>
                {f.file}:{f.start_line}
                {f.end_line !== f.start_line ? `-${f.end_line}` : ""}
              </div>
              <div style={s.rationale}>{f.rationale}</div>
              {f.suggestion && (
                <div style={s.suggestion}>
                  <strong>{t("trace.suggestedFix")} </strong>
                  {f.suggestion}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </TraceSection>
  );
}
