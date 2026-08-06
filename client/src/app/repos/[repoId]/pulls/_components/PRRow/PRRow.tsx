/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Avatar, Badge, CircularScore } from "@devdigest/ui";
import { RunCostBadge } from "@/components/run-cost-badge";
import { SeverityCounts, latestPerAgentRuns, totalOf } from "@/components/severity-counts";
import { FindingsHoverCard } from "@/components/findings-hover-card";
import { usePrReviews, usePrRuns } from "@/lib/hooks/reviews";
import type { PrMeta } from "@/lib/types";
import { SIZE_COLOR, STATUS_META } from "../../constants";
import { relativeTime, sizeOf } from "../../helpers";
import { s } from "../../styles";

export function PRRow({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null; // null score ⇒ PR has never been reviewed

  // The list payload carries counts only — the findings behind them are fetched
  // lazily on hover. Same query keys as the detail page, so this warms its cache.
  const [countsHovered, setCountsHovered] = React.useState(false);
  const findingsTotal = totalOf(pr.findings_by_severity);
  const wantFindings = countsHovered && findingsTotal > 0;
  const { data: reviews, isLoading: findingsLoading } = usePrReviews(pr.id, wantFindings);
  // Runs too, not just reviews: latestPerAgentRuns needs them to tell a re-run
  // that died from an agent that was never re-run. Without it the card would list
  // findings the chips beside it no longer count.
  const { data: prRuns } = usePrRuns(pr.id, wantFindings);
  const hoverFindings = React.useMemo(
    () => latestPerAgentRuns(reviews ?? [], prRuns ?? []).flatMap((r) => r.findings),
    [reviews, prRuns],
  );
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => router.push(`/repos/${repoId}/pulls/${pr.number}`)}
      style={s.row(h)}
    >
      <div style={s.rowTitleCell}>
        <Icon.GitPullRequest size={15} style={s.rowIcon(st.c)} />
        <div style={s.rowTitleWrap}>
          <div style={s.rowTitle(h)}>{pr.title}</div>
          <span className="mono" style={s.rowNumber}>
            #{pr.number}
          </span>
        </div>
      </div>
      <div style={s.authorCell}>
        <Avatar name={pr.author} size={18} />
        {pr.author}
      </div>
      <div>
        <Badge
          color={SIZE_COLOR[size]}
          bg="transparent"
          style={s.sizeBadgeBorder(SIZE_COLOR[size]!)}
        >
          {size} · {lines}
        </Badge>
      </div>
      <div style={s.scoreCell}>
        {reviewed ? (
          <CircularScore score={pr.score!} size={34} stroke={3} />
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
      <div style={s.findingsCell}>
        {findingsTotal > 0 ? (
          <FindingsHoverCard
            findings={hoverFindings}
            title={t("findingsPopover.title", { count: findingsTotal })}
            loading={findingsLoading}
            onHoverChange={setCountsHovered}
          >
            <SeverityCounts counts={pr.findings_by_severity} />
          </FindingsHoverCard>
        ) : (
          <SeverityCounts counts={pr.findings_by_severity} />
        )}
      </div>
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div style={s.costCell}>
        <RunCostBadge costUsd={pr.cost_usd} />
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}
