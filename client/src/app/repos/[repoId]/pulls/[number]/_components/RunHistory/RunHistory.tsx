"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, CircularScore } from "@devdigest/ui";
import type { RunSummary, PrCommit, FindingRecord } from "@devdigest/shared";
import { outcomeOf } from "@/lib/domain/runs";
import { severityTally } from "@/lib/domain/findings";
import { tsOf } from "@/lib/domain/time";
import { RunCostBadge } from "@/components/run-cost-badge";
import { SeverityCounts } from "@/components/severity-counts";
import { FindingsHoverCard } from "@/components/findings-hover-card";
import { OUTCOME_META, SHA_LENGTH } from "./constants";
import { s } from "./styles";

/**
 * PR timeline — every agent run interleaved with the PR's commits, newest-first
 * and DB-backed so it survives reload. Showing commits between runs makes it
 * clear which commit each review ran against. Failed runs show their error
 * inline; clicking a run row opens its trace.
 *
 * The badge reflects the review OUTCOME, not just the run lifecycle: a finished
 * run that found blockers reads "rejected", never a green "done". That rule is
 * `outcomeOf` in lib/domain/runs.ts (it mirrors the CI gate); the colour and icon
 * per outcome are this component's OUTCOME_META.
 */

type TimelineItem =
  | { kind: "run"; ts: number; run: RunSummary }
  | { kind: "commit"; ts: number; commit: PrCommit };

export interface RunHistoryProps {
  runs: RunSummary[];
  commits?: PrCommit[];
  /** run_id → that run's findings, for the per-run severity breakdown + hover
      card. Optional: without it a row shows only its total finding count. */
  findingsByRun?: Map<string, FindingRecord[]>;
  /** Open the trace + log drawer for a run (the logs icon). */
  onOpenTrace: (runId: string) => void;
  /** Jump to this run's inline review accordion below (clicking the agent name). */
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}

export function RunHistory({
  runs,
  commits = [],
  findingsByRun,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: RunHistoryProps) {
  const t = useTranslations("prReview");
  if (runs.length === 0 && commits.length === 0) return null;

  const items: TimelineItem[] = [
    ...runs.map((run) => ({ kind: "run" as const, ts: tsOf(run.ran_at), run })),
    ...commits.map((commit) => ({
      kind: "commit" as const,
      ts: tsOf(commit.committed_at),
      commit,
    })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div style={s.list}>
      {items.map((item) => {
        if (item.kind === "commit") {
          const c = item.commit;
          return (
            <div key={`commit:${c.sha}`} style={s.commitRow}>
              <Icon.GitCommit size={15} style={s.commitIcon} />
              <span className="mono" style={s.commitSha}>
                {c.sha.slice(0, SHA_LENGTH)}
              </span>
              <span style={s.commitMessage} title={c.message}>
                {c.message.split("\n")[0]}
              </span>
              <span style={s.meta}>{c.author}</span>
              {c.committed_at && (
                <span style={s.meta}>{new Date(c.committed_at).toLocaleTimeString()}</span>
              )}
            </div>
          );
        }

        const r = item.run;
        const outcome = outcomeOf(r);
        const meta = OUTCOME_META[outcome];
        const settled = r.status === "done";
        const runFindings = findingsByRun?.get(r.run_id) ?? [];
        return (
          <div key={`run:${r.run_id}`} style={s.row}>
            <Badge color={meta.color} bg={meta.bg} icon={meta.icon}>
              {t(`runStatus.${outcome}`)}
            </Badge>
            {settled && r.score != null && <CircularScore score={r.score} size={30} stroke={3} />}
            <div style={s.main}>
              <div style={s.agentLine}>
                <button
                  type="button"
                  onClick={() => onGoToReview?.(r.run_id)}
                  title={t("timeline.goToReview")}
                  style={s.agentButton(!!onGoToReview)}
                >
                  {r.agent_name ?? "Agent"}
                </button>{" "}
                <span className="mono" style={s.modelRef}>
                  {r.provider}/{r.model}
                </span>
              </div>
              {r.status === "failed" && r.error && (
                <div style={s.error} title={r.error}>
                  {r.error}
                </div>
              )}
              {settled && (
                <div style={s.counts}>
                  <span>
                    {t("runStatus.findings", { count: r.findings_count ?? 0 })}
                    {(r.blockers ?? 0) > 0 ? t("runStatus.blockers", { count: r.blockers ?? 0 }) : ""}
                  </span>
                  {runFindings.length > 0 && (
                    <FindingsHoverCard
                      findings={runFindings}
                      title={t("findingsPopover.titleInRun", { count: runFindings.length })}
                    >
                      <SeverityCounts counts={severityTally(runFindings)} />
                    </FindingsHoverCard>
                  )}
                </div>
              )}
            </div>
            <div style={s.aside}>
              {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
              {/* Usage only on settled runs: a failed/running row has no real
                  spend to report, and "0 tok · —" would just be noise. */}
              {settled && (
                <RunCostBadge
                  variant="with-tokens"
                  costUsd={r.cost_usd}
                  tokensIn={r.tokens_in}
                  tokensOut={r.tokens_out}
                />
              )}
            </div>
            <button
              type="button"
              title={t("timeline.openTrace")}
              aria-label={t("timeline.openTrace")}
              onClick={() => onOpenTrace(r.run_id)}
              style={s.iconBtn}
            >
              <Icon.FileText size={13} />
            </button>
            {onDelete && r.status !== "running" && (
              <span
                role="button"
                aria-label={t("timeline.deleteRun")}
                title={t("timeline.deleteRun")}
                onClick={() => onDelete(r.run_id)}
                style={s.deleteBtn}
              >
                <Icon.Trash size={13} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
