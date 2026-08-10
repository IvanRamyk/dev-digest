"use client";

import React, { useCallback } from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Button, SectionLabel, EmptyState } from "@devdigest/ui";
import { useCancelRun, useDeleteRun } from "@/lib/hooks/reviews";
import { RunStatus } from "../RunStatus";
import { RunHistory } from "../RunHistory";
import { ReviewRunAccordion } from "../ReviewRunAccordion";
import { s } from "./styles";
import type { FindingRecord, ReviewRecord, RunSummary, PrCommit } from "@devdigest/shared";

export interface FindingsTabProps {
  prId: string | null;
  repoId: string;
  liveRunIds: string[];
  reviewRunning: boolean;
  lethalTrifecta: FindingRecord[];
  runs: ReviewRecord[];
  prRuns: RunSummary[] | undefined;
  prCommits: PrCommit[];
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  onOpenTrace: (id: string) => void;
}

export function FindingsTab({
  prId,
  repoId,
  liveRunIds,
  reviewRunning,
  lethalTrifecta,
  runs,
  prRuns,
  prCommits,
  repoFullName,
  headSha,
  onOpenTrace,
}: FindingsTabProps) {
  const t = useTranslations("prReview");
  // Cancel/delete belong to the surface that renders the buttons; both hooks own
  // their own cache invalidation (C15), so nothing is threaded down from the page.
  const cancel = useCancelRun(prId);
  const deleteRun = useDeleteRun(prId, repoId);

  const handleCancelAll = useCallback(() => {
    liveRunIds.forEach((id) => cancel.mutate(id));
  }, [liveRunIds, cancel]);

  const handleOpenFirstTrace = useCallback(() => {
    if (liveRunIds[0]) onOpenTrace(liveRunIds[0]);
  }, [liveRunIds, onOpenTrace]);

  const handleDelete = useCallback(
    (id: string) => {
      if (window.confirm(t("findingsTab.deleteRunConfirm"))) deleteRun.mutate(id);
    },
    [deleteRun, t],
  );

  // Per-run findings for the timeline's severity breakdown. Derived from the
  // reviews already loaded (each ReviewRecord carries its run_id + findings), so
  // the timeline costs no extra request.
  const findingsByRun = React.useMemo(
    () =>
      new Map(
        runs.filter((r) => r.run_id != null).map((r) => [r.run_id as string, r.findings]),
      ),
    [runs],
  );

  // Timeline → Review-runs navigation: clicking an agent name in the timeline
  // opens + scrolls to that run's accordion below. The nonce re-triggers the
  // scroll even when the same run is clicked twice.
  const [target, setTarget] = React.useState<{ runId: string; n: number } | null>(null);
  const handleGoToReview = useCallback((runId: string) => {
    setTarget((p) => ({ runId, n: (p?.n ?? 0) + 1 }));
  }, []);

  return (
    <section>
      {liveRunIds.length > 0 && (
        <div style={s.liveRunSection}>
          <SectionLabel
            icon="Sparkles"
            right={
              <div style={s.cancelActions}>
                <Button
                  kind="danger"
                  size="sm"
                  icon="X"
                  loading={cancel.isPending}
                  onClick={handleCancelAll}
                  title={t("findingsTab.cancelAll")}
                >
                  {t("findingsTab.cancel")}
                </Button>
                <Button kind="ghost" size="sm" icon="FileText" onClick={handleOpenFirstTrace}>
                  {t("findingsTab.openTrace")}
                </Button>
              </div>
            }
          >
            {t("findingsTab.liveReview")}
          </SectionLabel>
          <RunStatus runIds={liveRunIds} prId={prId} repoId={repoId} />
        </div>
      )}

      {reviewRunning && (
        <div style={s.reviewInProgress}>
          <Icon.RefreshCw size={16} style={s.spinner} />
          <span style={s.reviewInProgressText}>{t("findingsTab.inProgress")}</span>
          <span style={s.reviewInProgressSub}>{t("findingsTab.inProgressSub")}</span>
        </div>
      )}

      {lethalTrifecta.length > 0 && (
        <div style={s.lethalTrifecta}>
          <Icon.Shield size={16} style={s.trifectaIcon} />
          <span style={s.lethalTrifectaTitle}>{t("trifecta.detected")}</span>
          <Badge color="var(--crit)" bg="transparent">
            {t("trifecta.findingCount", { count: lethalTrifecta.length })}
          </Badge>
        </div>
      )}

      {((prRuns && prRuns.length > 0) || prCommits.length > 0) && (
        <div style={s.timelineSection}>
          <SectionLabel icon="Activity" right={<span style={s.sectionHint}>{t("findingsTab.timelineHint")}</span>}>
            {t("findingsTab.timeline")}
          </SectionLabel>
          <RunHistory
            runs={prRuns ?? []}
            commits={prCommits}
            findingsByRun={findingsByRun}
            onOpenTrace={onOpenTrace}
            onGoToReview={handleGoToReview}
            onDelete={handleDelete}
          />
        </div>
      )}

      <SectionLabel icon="AlertOctagon" right={<span style={s.sectionHint}>{t("findingsTab.reviewRunsHint")}</span>}>
        {t("findingsTab.reviewRuns")}
      </SectionLabel>
      {runs.length === 0 ? (
        reviewRunning || liveRunIds.length > 0 ? null : (
          <EmptyState
            icon="Sparkles"
            title={t("findingsTab.emptyTitle")}
            body={t("findingsTab.emptyBody")}
          />
        )
      ) : (
        prId &&
        runs.map((review, i) => (
          <ReviewRunAccordion
            key={review.id}
            review={review}
            prId={prId}
            repoId={repoId}
            defaultOpen={i === 0}
            repoFullName={repoFullName}
            headSha={headSha}
            targetRunId={target?.runId ?? null}
            targetNonce={target?.n ?? 0}
          />
        ))
      )}
    </section>
  );
}
