"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrBlast } from "@/lib/hooks/blast";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";
import { NS } from "./constants";
import { callerLocation, isIncompleteIndex, parseEndpoint } from "./helpers";

interface BlastTabProps {
  prId: string | null;
  /** owner/repo — pins caller links to github.com. */
  repoFullName: string | null | undefined;
  /** PR head sha — keeps blob line numbers accurate. */
  headSha: string | null | undefined;
}

/**
 * Route-private Blast Radius tab. All data flows through `usePrBlast` (C14);
 * display values (caller counts, endpoint methods) are derived during render,
 * not stored (react-best-practices). Caller `file:line` rows are clickable
 * GitHub links via the shared `githubBlobUrl` helper — the same one FindingCard
 * uses. Repo-derived names render as plain text, never HTML.
 */
export function BlastTab({ prId, repoFullName, headSha }: BlastTabProps) {
  const t = useTranslations(NS);
  const { data: blast, isLoading, isError } = usePrBlast(prId);

  const header = <SectionLabel icon="GitBranch">{t("sectionLabel")}</SectionLabel>;

  if (isLoading) {
    return (
      <section style={s.card}>
        {header}
        <Skeleton height={16} width={360} />
        <Skeleton height={80} />
      </section>
    );
  }

  if (isError || !blast) {
    return (
      <section style={s.card}>
        {header}
        <div role="alert" style={s.empty}>
          {t("loadError")}
        </div>
      </section>
    );
  }

  const incomplete = isIncompleteIndex(blast.index_state);

  return (
    <section style={s.card}>
      {header}

      {incomplete && (
        <div role="alert" style={s.degradedNotice}>
          <span>{t("degraded.partial", { status: blast.index_state.status })}</span>
          {blast.index_state.reason && (
            <span style={s.degradedReason}>
              {t("degraded.reason", { reason: blast.index_state.reason })}
            </span>
          )}
        </div>
      )}

      {blast.summary && (
        <div>
          <div style={s.chipLabel}>{t("summaryLabel")}</div>
          <div style={s.summary}>{blast.summary}</div>
        </div>
      )}

      {blast.changed_symbols.length === 0 ? (
        <div style={s.empty}>{t("empty")}</div>
      ) : (
        <div style={s.sectionLabelRow}>
          <span style={s.chipLabel}>{t("changedSymbols")}</span>
          <Badge>{blast.changed_symbols.length}</Badge>
        </div>
      )}

      {blast.downstream.map((impact) => (
        <div key={impact.symbol} style={s.symbolBlock}>
          <div style={s.symbolHeader}>
            <span className="mono" style={s.symbolName}>
              {impact.symbol}
            </span>
            <Badge icon="Users">{t("callerCount", { count: impact.callers.length })}</Badge>
          </div>

          <ul style={s.callerList}>
            {impact.callers.map((caller, i) => (
              <li key={`${caller.file}:${caller.line}:${i}`} style={s.callerRow}>
                <span className="mono" style={s.callerName}>
                  {caller.name}
                </span>
                {repoFullName && headSha ? (
                  <a
                    className="mono"
                    style={s.callerLink}
                    href={githubBlobUrl(repoFullName, headSha, caller.file, caller.line)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("openInGithubAria", { file: caller.file, line: caller.line })}
                  >
                    {callerLocation(caller.file, caller.line)}
                  </a>
                ) : (
                  <span className="mono" style={s.callerName}>
                    {callerLocation(caller.file, caller.line)}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {impact.endpoints_affected.length > 0 && (
            <div style={s.chipRow}>
              <span style={s.chipLabel}>{t("endpointsLabel")}</span>
              {impact.endpoints_affected.map((endpoint, i) => {
                const { method, path } = parseEndpoint(endpoint);
                return (
                  <Badge key={`ep-${i}`} mono>
                    {method ? `${method} ${path}` : path}
                  </Badge>
                );
              })}
            </div>
          )}

          {impact.crons_affected.length > 0 && (
            <div style={s.chipRow}>
              <span style={s.chipLabel}>{t("cronsLabel")}</span>
              {impact.crons_affected.map((cron, i) => (
                <Badge key={`cron-${i}`} icon="Clock" mono>
                  {cron}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Prior-PR overlap is not exposed to the client for this PR (R3): render
          the section header with an availability note rather than inventing a
          server endpoint (out of scope for this plan). */}
      <div>
        <div style={s.chipLabel}>{t("priorPrsLabel")}</div>
        <div style={s.priorPrs}>{t("priorPrsUnavailable")}</div>
      </div>
    </section>
  );
}
