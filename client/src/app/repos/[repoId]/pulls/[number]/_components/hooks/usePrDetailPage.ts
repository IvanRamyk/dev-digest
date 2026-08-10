/* usePrDetailPage — all the wiring the PR detail route needs, so page.tsx can
   stay a composition root (C3). Owns: number→uuid resolution, the six queries,
   ?tab / ?trace URL state, and the derived findings.

   No invalidation lives here — every mutation invalidates its own writes (C15). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { usePullDetail, usePulls } from "@/lib/hooks";
import { usePrActiveRuns, usePrReviews, usePrRuns } from "@/lib/hooks/reviews";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { latestPerAgentRuns } from "@/lib/domain/reviews";
import { ApiError } from "@/lib/api";
import { githubPrUrl } from "@/lib/github-urls";

export function usePrDetailPage(repoId: string, number: string) {
  const search = useSearchParams();
  const router = useRouter();
  const t = useTranslations("prReview");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  // The route is keyed by PR number, but every PR API is keyed by the row's
  // uuid — resolve number → uuid via the (cached) pulls list before fetching.
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = pulls?.find((p) => p.number === Number(number))?.id ?? null;
  const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);
  const { data: reviews } = usePrReviews(prId);

  // Live run tracking is SERVER-SOURCED (agent_runs status='running'): survives
  // navigation AND reload, and self-clears once the runs settle.
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);

  const liveRunIds = React.useMemo(
    () => (activeRuns ?? []).map((r) => r.run_id),
    [activeRuns],
  );

  // ---- URL state (?tab, ?trace) ----
  const tab = search.get("tab") ?? "overview";
  const traceRunId = search.get("trace");
  const setParam = React.useCallback(
    (key: string, val: string | null) => {
      const sp = new URLSearchParams(search.toString());
      if (val == null) sp.delete(key);
      else sp.set(key, val);
      router.replace(
        `/repos/${repoId}/pulls/${number}${sp.toString() ? `?${sp.toString()}` : ""}`,
      );
    },
    [search, router, repoId, number],
  );
  const setTab = React.useCallback((next: string) => setParam("tab", next), [setParam]);
  const openTrace = React.useCallback((id: string) => setParam("trace", id), [setParam]);
  const closeTrace = React.useCallback(() => setParam("trace", null), [setParam]);
  const onRunStart = React.useCallback(() => setTab("findings"), [setTab]);

  // Reviews come newest-first; each is its own run (grouped into accordions).
  const runs = reviews ?? [];

  // Counts describe the CURRENT state of the review: per agent, the review from
  // that agent's latest RUN — and nothing when that run failed, was cancelled, or
  // is still going. Keyed on runs, not reviews, so a dead newest run suppresses
  // the agent's earlier findings instead of resurrecting them. Matches the PR
  // list's findings_by_severity and cost_usd.
  //
  // The accordion list still renders every review: run history does not disappear
  // when a run is superseded, so the tab badge deliberately does not equal the sum
  // of the accordion headers.
  const allFindings: FindingRecord[] = React.useMemo(
    () => latestPerAgentRuns(runs, prRuns ?? []).flatMap((r) => r.findings),
    [runs, prRuns],
  );
  const lethalTrifecta = React.useMemo(
    () => allFindings.filter((f) => f.kind === "lethal_trifecta"),
    [allFindings],
  );

  const repoFullName = activeRepo?.full_name ?? null;
  const crumb = React.useMemo(
    () => [
      { label: repoFullName ?? repoId, mono: true, href: `/repos/${repoId}/pulls` },
      { label: t("list.breadcrumb"), href: `/repos/${repoId}/pulls` },
      { label: `#${number}`, mono: true },
    ],
    [repoFullName, repoId, number, t],
  );

  const tracedReview = traceRunId ? runs.find((r) => r.run_id === traceRunId) : undefined;

  return {
    // data
    pr,
    prId,
    runs,
    prRuns,
    // state
    isLoading: pullsLoading || (prId != null && detailLoading),
    isError,
    errorMessage: error instanceof ApiError ? error.message : null,
    repoNotFound,
    refetch,
    // derived
    findingsCount: allFindings.length,
    lethalTrifecta,
    liveRunIds,
    reviewRunning: liveRunIds.length > 0,
    repoFullName,
    githubUrl: repoFullName && pr ? githubPrUrl(repoFullName, pr.number) : null,
    crumb,
    // url state
    tab,
    setTab,
    onRunStart,
    traceRunId,
    traceFindings: tracedReview?.findings ?? [],
    traceAgentName: tracedReview?.agent_name ?? null,
    openTrace,
    closeTrace,
  };
}
