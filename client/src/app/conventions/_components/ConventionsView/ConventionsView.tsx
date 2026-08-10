/* /conventions — Conventions Extractor. Scan the active repo's cloned code,
   review candidate house-rules each backed by evidence, accept/reject/edit,
   and merge the accepted ones into a Skill. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo } from "@/lib/repo-context";
import { notify } from "@/lib/toast";
import {
  useBulkUpdateConventions,
  useConventionScan,
  useConventions,
  useStartConventionScan,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillModal } from "../CreateSkillModal";
import { firstUnverifiedIndex, formatRelativeTime, sortCandidates } from "./helpers";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const router = useRouter();
  const { activeRepo, reposLoaded } = useActiveRepo();
  const repoId = activeRepo?.id ?? null;

  const view = useConventions(repoId);
  const scanPoll = useConventionScan(repoId);
  const startScan = useStartConventionScan(repoId);
  const update = useUpdateConvention(repoId);
  const bulk = useBulkUpdateConventions(repoId);
  const [modalOpen, setModalOpen] = React.useState(false);

  if (reposLoaded && !activeRepo) {
    return (
      <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const scan = scanPoll.data ?? view.data?.scan ?? null;
  const scanning = scan?.status === "queued" || scan?.status === "running";
  const candidates = view.data?.candidates ?? [];
  const sorted = sortCandidates(candidates);
  const dividerIndex = firstUnverifiedIndex(sorted);
  const acceptedCount = candidates.filter((c) => c.status === "accepted").length;

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              {activeRepo?.full_name ?? t("page.repoFallback")}
            </h1>
            <div style={s.subtitle}>{t("page.subtitle")}</div>
          </div>
          <div style={s.headerActions}>
            {candidates.length > 0 && (
              <Button
                kind="ghost"
                size="sm"
                disabled={scanning}
                onClick={() => bulk.mutate({ ids: candidates.map((c) => c.id), status: "rejected" })}
              >
                {t("page.deselectAll")}
              </Button>
            )}
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              loading={scanning || startScan.isPending}
              disabled={scanning || startScan.isPending}
              onClick={() => startScan.mutate()}
            >
              {scanning ? t("page.scanning") : scan ? t("page.rescan") : t("page.runExtraction")}
            </Button>
            <Button
              kind="primary"
              size="sm"
              disabled={acceptedCount === 0}
              onClick={() => setModalOpen(true)}
            >
              {t("page.createSkill")}
            </Button>
          </div>
        </div>

        {scan && (
          <div style={s.metaRow}>
            <span>{t("page.detectedFrom", { count: scan.sample_file_count })}</span>
            {scan.created_at && <span>{t("page.lastScan", { when: formatRelativeTime(scan.created_at) })}</span>}
            {candidates.length > 0 && (
              <span>{t("page.acceptedCount", { accepted: acceptedCount, total: candidates.length })}</span>
            )}
          </div>
        )}

        {scan?.status === "failed" && (
          <ErrorState
            title={t("page.extractionFailed")}
            body={
              scan.error === "no_api_key" ? (
                <>
                  {t("page.noApiKey")}{" "}
                  <a href="/settings/api-keys" style={{ color: "var(--accent)" }}>
                    {t("page.openApiKeys")}
                  </a>
                </>
              ) : (
                scan.error
              )
            }
            onRetry={() => startScan.mutate()}
          />
        )}

        {view.isLoading && (
          <div style={s.grid}>
            <Skeleton height={180} />
            <Skeleton height={180} />
            <Skeleton height={180} />
          </div>
        )}

        {view.isError && <ErrorState body={t("page.loadError")} onRetry={() => view.refetch()} />}

        {!view.isLoading && !view.isError && candidates.length === 0 && scan?.status !== 'failed' && (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            ctaLoading={scanning || startScan.isPending}
            onCta={() => startScan.mutate()}
          />
        )}

        {candidates.length > 0 && (
          <div style={s.grid}>
            {sorted.map((c, i) => (
              <React.Fragment key={c.id}>
                {i === dividerIndex && (
                  <div style={s.divider}>
                    <span>{t("page.unverifiedDivider")}</span>
                    <div style={s.dividerLine} />
                  </div>
                )}
                <ConventionCard
                  candidate={c}
                  onAccept={() => update.mutate({ id: c.id, patch: { status: "accepted" } })}
                  onReject={() => update.mutate({ id: c.id, patch: { status: "rejected" } })}
                  onSaveRule={(rule) => update.mutate({ id: c.id, patch: { rule } })}
                />
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <CreateSkillModal
          repoId={repoId}
          onClose={() => setModalOpen(false)}
          onCreated={() => {
            setModalOpen(false);
            // Toast with an action, not a redirect — the user keeps their scan context.
            notify.success(t("modal.successToast"), {
              label: t("modal.openInSkillsLab"),
              onClick: () => router.push("/skills"),
            });
          }}
        />
      )}
    </AppShell>
  );
}
