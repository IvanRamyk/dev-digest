/* SmartDiffGroupSection — one review-role group (core / wiring / boilerplate):
   a header (icon, label, caption, churn summary) and the group's FileCards,
   each carrying its finding marks and a "jump to finding" badge. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Icon, SEV } from "@devdigest/ui";
import type { PrFile, SmartDiffGroup, FindingRecord } from "@devdigest/shared";
import { FileCard, type DiffCommentApi } from "@/components/diff-viewer";
import { ROLE_META } from "../../constants";
import {
  findingCountForFile,
  firstFindingLine,
  marksForFile,
  totalsOf,
  worstSeverityForFile,
} from "../../helpers";
import { s } from "./styles";

export interface SmartDiffGroupSectionProps {
  group: SmartDiffGroup;
  /** path → the PrDetail file (with its patch body). */
  filesByPath: Map<string, PrFile>;
  /** Live findings across the PR (for severity marks + counts). */
  findings: FindingRecord[];
  /** Inline commenting, forwarded to each FileCard (offered on open PRs). */
  commenting?: DiffCommentApi;
  /** Per-file open state, keyed by path, owned by the parent viewer. */
  openByPath: ReadonlyMap<string, boolean>;
  onToggle: (path: string) => void;
  /** Open the file and scroll a finding line into view. */
  onJumpToFinding: (path: string, line: number) => void;
}

export function SmartDiffGroupSection({
  group,
  filesByPath,
  findings,
  commenting,
  openByPath,
  onToggle,
  onJumpToFinding,
}: SmartDiffGroupSectionProps) {
  const t = useTranslations("prReview.smartDiff");
  const meta = ROLE_META[group.role];
  if (group.files.length === 0) return null;

  const totals = totalsOf(group.files);

  return (
    <section style={s.section}>
      <div style={s.header}>
        {(() => {
          const I = Icon[meta.icon];
          return <I size={15} style={s.headIcon(meta.c)} />;
        })()}
        <span style={{ ...s.label, color: meta.c }}>{t(meta.labelKey)}</span>
        <span style={s.caption}>{t(meta.captionKey)}</span>
        <span className="tnum" style={s.summary}>
          {t("summary", {
            files: totals.files,
            additions: totals.additions,
            deletions: totals.deletions,
          })}
        </span>
      </div>

      <div style={s.files}>
        {group.files.map((sf) => {
          const file: PrFile =
            filesByPath.get(sf.path) ?? {
              path: sf.path,
              additions: sf.additions,
              deletions: sf.deletions,
              patch: null,
            };
          const count = findingCountForFile(sf, findings);
          const first = firstFindingLine(sf);
          // Badge colour tracks the file's worst finding; while the reviews
          // query is still loading (severity unknown) fall back to CRITICAL.
          const sev = SEV[worstSeverityForFile(sf.path, findings) ?? "CRITICAL"];

          return (
            <FileCard
              key={sf.path}
              file={file}
              commenting={commenting}
              open={openByPath.get(sf.path) ?? false}
              onToggle={() => onToggle(sf.path)}
              marks={marksForFile(sf.path, findings)}
              lineIdPrefix={sf.path}
              headerRight={
                count > 0 ? (
                  <button
                    type="button"
                    style={s.jumpBtn}
                    aria-label={t("jumpToFinding", { path: sf.path })}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (first != null) onJumpToFinding(sf.path, first);
                    }}
                  >
                    <Badge dot color={sev.c} bg={sev.bg}>
                      {t("findingsBadge", { count })}
                    </Badge>
                  </button>
                ) : undefined
              }
            />
          );
        })}
      </div>
    </section>
  );
}
