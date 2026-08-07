/* SeverityCounts — "3 CRITICAL · 5 WARNING · 2 SUGGESTION".
   "chips"    → non-interactive icon+count, for the PR list cell and timeline rows.
   "counters" → Chip toggles that filter, for a run's findings toolbar.
   Both read colours and icons from the design system's SEV map, so this never
   becomes a fourth severity→colour map. */
"use client";

import { useTranslations } from "next-intl";
import { Icon, Chip, SEV, type Severity as UiSeverity } from "@devdigest/ui";
import type { FindingsBySeverity, Severity } from "@devdigest/shared";
import { SEVERITY_BUCKETS, NO_DATA } from "./constants";
import { totalOf } from "@/lib/domain/findings";
import { s } from "./styles";

export interface SeverityCountsProps {
  /** null/undefined = never reviewed (renders "—"). {0,0,0} = reviewed and clean. */
  counts: FindingsBySeverity | null | undefined;
  variant?: "chips" | "counters";
  /** counters only — the severity currently filtered on. */
  active?: Severity | null;
  /** counters only — receives null when the active severity is toggled off. */
  onSelect?: (severity: Severity | null) => void;
}

/**
 * `null` and `{0,0,0}` are different states and must not collapse: an unreviewed
 * PR shows an em-dash, a reviewed-and-clean one shows a check. That distinction is
 * the whole signal — a clean PR must not look like one nobody has looked at.
 *
 * The "chips" variant renders plain `<span>`s, never buttons: it sits inside a PR
 * row whose entire body is one navigation target, and a nested button would either
 * swallow that click or need stopPropagation to un-swallow it.
 */
export function SeverityCounts({
  counts,
  variant = "chips",
  active = null,
  onSelect,
}: SeverityCountsProps) {
  const t = useTranslations("prReview");
  const total = totalOf(counts);

  if (variant === "counters") {
    // Nothing to filter by. The panel's own EmptyState covers "no findings yet".
    if (counts == null || total === 0) return null;
    return (
      <div style={s.counterRow}>
        {SEVERITY_BUCKETS.filter((sev) => counts[sev] > 0).map((sev) => {
          const meta = SEV[sev as UiSeverity];
          const label = t(`severity.${sev.toLowerCase()}`);
          return (
            <Chip
              key={sev}
              icon={meta.icon}
              color={meta.c}
              count={counts[sev]}
              active={active === sev}
              // Single-select: clicking the active severity clears the filter.
              onClick={() => onSelect?.(active === sev ? null : sev)}
            >
              {label}
            </Chip>
          );
        })}
      </div>
    );
  }

  if (counts == null) return <span style={s.muted}>{NO_DATA}</span>;
  if (total === 0) {
    return (
      <span style={s.clean} title={t("findingsPopover.clean")}>
        <Icon.Check size={14} />
      </span>
    );
  }

  return (
    <span style={s.chipRow}>
      {SEVERITY_BUCKETS.filter((sev) => counts[sev] > 0).map((sev) => {
        const meta = SEV[sev as UiSeverity];
        const SevIcon = Icon[meta.icon];
        return (
          <span key={sev} className="tnum" style={s.chip(meta.c)}>
            <SevIcon size={13} />
            {counts[sev]}
          </span>
        );
      })}
    </span>
  );
}

export default SeverityCounts;
