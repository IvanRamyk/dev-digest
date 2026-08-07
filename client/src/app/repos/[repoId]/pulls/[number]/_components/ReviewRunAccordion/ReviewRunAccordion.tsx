/* ReviewRunAccordion — one collapsible review RUN (a single agent's pass over
   the PR). Header shows agent + verdict + counts + score + when it ran; the
   body holds that run's VerdictBanner summary and its own FindingsPanel. A PR
   can have many runs (different agents / re-runs over time) — each is separate
   and collapsible so older runs don't bury the latest. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import type { ReviewRecord, Verdict } from "@devdigest/shared";
import { useDeleteReview } from "@/lib/hooks/reviews";
import { VERDICT_META, VERDICT_FALLBACK_COLOR } from "../../constants";
import { FindingsPanel } from "../FindingsPanel";
import { VerdictBanner } from "../VerdictBanner";
import { s } from "./styles";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export interface ReviewRunAccordionProps {
  review: ReviewRecord;
  prId: string;
  /** Invalidation scope — deleting a review changes the PR list's counters. */
  repoId: string;
  defaultOpen?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** When this matches review.run_id, the accordion opens and scrolls into view
   *  (driven from the Timeline: clicking an agent name navigates here). */
  targetRunId?: string | null;
  targetNonce?: number;
}

export function ReviewRunAccordion({
  review,
  prId,
  repoId,
  defaultOpen = false,
  repoFullName,
  headSha,
  targetRunId = null,
  targetNonce = 0,
}: ReviewRunAccordionProps) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(defaultOpen);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (review.run_id && review.run_id === targetRunId) {
      setOpen(true);
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRunId, targetNonce, review.run_id]);
  const del = useDeleteReview(prId, repoId);
  const findings = review.findings;
  const blockers = findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length;
  // Verdict colour comes from the shared VERDICT_META (C13) — a local copy here is
  // how "comment" once rendered var(--warn) while the banner used var(--info).
  const verdictColor = review.verdict
    ? (VERDICT_META[review.verdict as Verdict]?.c ?? VERDICT_FALLBACK_COLOR)
    : VERDICT_FALLBACK_COLOR;
  const agentName = review.agent_name ?? t("reviewRun.agentFallback");

  return (
    <div
      ref={rootRef}
      id={review.run_id ? `review-run-${review.run_id}` : undefined}
      style={s.root}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
        style={s.header}
      >
        <Icon.Cpu size={15} style={s.agentIcon} />
        <span style={s.agentName}>{agentName}</span>
        {review.verdict && (
          <Badge color={verdictColor} bg="transparent">
            {t(`verdict.${VERDICT_META[review.verdict as Verdict]?.labelKey ?? "comment"}`)}
          </Badge>
        )}
        <span style={s.counts}>
          {t("reviewRun.findingCount", { count: findings.length })}
          {blockers > 0 ? t("reviewRun.blockers", { count: blockers }) : ""}
        </span>
        <span style={s.spacer} />
        {review.score != null && (
          <Badge mono color="var(--text-secondary)">
            {review.score}
          </Badge>
        )}
        <span className="mono" style={s.when}>
          {formatWhen(review.created_at)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(t("reviewRun.deleteConfirm", { agent: agentName }))) {
              del.mutate(review.id);
            }
          }}
          disabled={del.isPending}
          title={t("timeline.deleteReviewRun")}
          aria-label={t("timeline.deleteReviewRun")}
          style={s.deleteBtn(del.isPending)}
        >
          <Icon.Trash size={14} style={del.isPending ? s.spinning : undefined} />
        </button>
        <Icon.ChevronDown size={16} style={s.chevron(open)} />
      </div>

      {open && (
        <div style={s.body}>
          {review.verdict && (
            <div style={s.verdictWrap}>
              <VerdictBanner
                verdict={review.verdict as Verdict}
                summary={review.summary}
                score={review.score}
                findingsCount={findings.length}
                blockers={blockers}
                agentName={review.agent_name}
              />
            </div>
          )}
          <FindingsPanel
            findings={findings}
            prId={prId}
            repoId={repoId}
            repoFullName={repoFullName}
            headSha={headSha}
          />
        </div>
      )}
    </div>
  );
}

export default ReviewRunAccordion;
