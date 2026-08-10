/* PR Detail — /repos/:repoId/pulls/:number. F2 shell extended by A2 with:
   - Findings panel (VerdictBanner + FindingCards)
   - RunReviewDropdown (run all / a specific agent) + live SSE RunStatus
   - Basic file-by-file diff viewer in the Files tab
   Tab state lives in query (?tab).

   Composition root (C3): route params in, one view per tab out. The wiring lives
   in ./_components/hooks/usePrDetailPage. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton, ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { PrDetailHeader } from "./_components/PrDetailHeader";
import { OverviewTab } from "./_components/OverviewTab";
import { FindingsTab } from "./_components/FindingsTab";
import { DiffTab } from "./_components/DiffTab";
import RunTraceDrawer from "./_components/RunTraceDrawer";
import { usePrDetailPage } from "./_components/hooks/usePrDetailPage";
import { s } from "./styles";

export default function PRDetailPage() {
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  const t = useTranslations("prReview");
  const vm = usePrDetailPage(repoId, number);

  if (vm.repoNotFound) {
    return (
      <AppShell crumb={vm.crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  if (vm.isLoading) {
    return (
      <AppShell crumb={vm.crumb}>
        <div style={s.loading}>
          <Skeleton height={28} width={420} />
          <Skeleton height={16} width={300} />
          <Skeleton height={200} />
        </div>
      </AppShell>
    );
  }

  if (vm.isError || !vm.pr) {
    return (
      <AppShell crumb={vm.crumb}>
        <ErrorState
          fullScreen
          title={t("findingsTab.loadErrorTitle")}
          body={vm.errorMessage ?? t("findingsTab.loadErrorBody", { number })}
          onRetry={vm.refetch}
        />
      </AppShell>
    );
  }

  const { pr } = vm;

  return (
    <AppShell crumb={vm.crumb}>
      <PrDetailHeader
        pr={pr}
        prId={vm.prId}
        tab={vm.tab}
        findingsCount={vm.findingsCount}
        githubUrl={vm.githubUrl}
        onSetTab={vm.setTab}
        onRunStart={vm.onRunStart}
      />

      <div style={s.body}>
        {vm.tab === "overview" && <OverviewTab prBody={pr.body} />}

        {vm.tab === "findings" && (
          <FindingsTab
            prId={vm.prId}
            repoId={repoId}
            liveRunIds={vm.liveRunIds}
            reviewRunning={vm.reviewRunning}
            lethalTrifecta={vm.lethalTrifecta}
            runs={vm.runs}
            prRuns={vm.prRuns}
            prCommits={pr.commits}
            repoFullName={vm.repoFullName}
            headSha={pr.head_sha}
            onOpenTrace={vm.openTrace}
          />
        )}

        {vm.tab === "diff" && (
          <DiffTab
            prId={vm.prId}
            filesCount={pr.files_count}
            files={pr.files}
            canComment={pr.status === "open"}
          />
        )}
      </div>

      {vm.prId && vm.traceRunId && (
        <RunTraceDrawer
          runId={vm.traceRunId}
          prNumber={pr.number}
          findings={vm.traceFindings}
          agentName={vm.traceAgentName}
          onClose={vm.closeTrace}
        />
      )}
    </AppShell>
  );
}
