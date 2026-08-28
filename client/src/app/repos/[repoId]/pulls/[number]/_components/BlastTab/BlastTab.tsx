"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrBlast } from "@/lib/hooks/blast";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";
import { NS } from "./constants";
import {
  blastStats,
  callerLocation,
  endpointTokens,
  isIncompleteIndex,
  parseEndpoint,
  treeGuide,
} from "./helpers";

interface BlastTabProps {
  prId: string | null;
  /** owner/repo — pins caller links to github.com. */
  repoFullName: string | null | undefined;
  /** PR head sha — keeps blob line numbers accurate. */
  headSha: string | null | undefined;
}

/**
 * Route-private Blast Radius tab. All data flows through `usePrBlast` (C14);
 * display values (stat counts, endpoint methods) are derived during render,
 * not stored (react-best-practices). Caller `file:line` rows are clickable
 * GitHub links via the shared `githubBlobUrl` helper — the same one FindingCard
 * uses. Repo-derived names render as plain text, never HTML. The Graph view is
 * intentionally not built: the toggle shows Tree active with Graph disabled.
 */
export function BlastTab({ prId, repoFullName, headSha }: BlastTabProps) {
  const t = useTranslations(NS);
  const { data: blast, isLoading, isError } = usePrBlast(prId);

  const header = (
    <div style={s.headerRow}>
      <SectionLabel icon="Workflow">{t("sectionLabel")}</SectionLabel>
      <div style={s.viewToggle} role="group" aria-label={t("view.groupAria")}>
        <span style={{ ...s.viewBtn, ...s.viewBtnActive }} aria-current="true">
          {t("view.tree")}
        </span>
        <button
          type="button"
          style={{ ...s.viewBtn, ...s.viewBtnDisabled }}
          disabled
          title={t("view.graphDisabledTitle")}
        >
          {t("view.graph")}
        </button>
      </div>
    </div>
  );

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
  const stats = blastStats(blast);
  const hasSymbols = blast.changed_symbols.length > 0;

  return (
    <section style={s.card}>
      {header}

      <div style={s.statsRow}>
        <Stat icon="Code" num={stats.symbols} label={t("stat.symbols")} />
        <Stat icon="CornerDownRight" num={stats.callers} label={t("stat.callers")} />
        <Stat icon="Globe" num={stats.endpoints} label={t("stat.endpoints")} />
        <Stat icon="Clock" num={stats.crons} label={t("stat.crons")} />
      </div>

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

      {blast.summary && <div style={s.summary}>{blast.summary}</div>}

      {!hasSymbols && <div style={s.empty}>{t("empty")}</div>}

      {hasSymbols && blast.downstream.length === 0 && (
        <div style={s.noDownstream}>
          {t("noDownstream", { count: blast.changed_symbols.length })}
        </div>
      )}

      {blast.downstream.map((impact) => (
        <div key={impact.symbol} style={s.symbolBlock}>
          <div style={s.symbolHeader}>
            <span style={s.symbolNameWrap}>
              <Icon.Code size={14} />
              <span className="mono" style={s.symbolName}>
                {impact.symbol}
              </span>
            </span>
            <span style={s.callerCount}>{t("callerCount", { count: impact.callers.length })}</span>
          </div>

          <ul style={s.callerList}>
            {impact.callers.map((caller, i) => (
              <li key={`${caller.file}:${caller.line}:${i}`} style={s.callerRow}>
                <span className="mono" style={s.treeGuide} aria-hidden="true">
                  {treeGuide(i, impact.callers.length)}
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
                  <span className="mono" style={s.callerPlain}>
                    {callerLocation(caller.file, caller.line)}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {impact.endpoints_affected.length > 0 && (
            <div style={s.chipRow}>
              {impact.endpoints_affected.map((endpoint, i) => {
                const { method, path } = parseEndpoint(endpoint);
                const tk = endpointTokens(method);
                return (
                  <Badge key={`ep-${i}`} icon="Globe" mono color={tk.color} bg={tk.bg}>
                    {method ? `${method} ${path}` : path}
                  </Badge>
                );
              })}
            </div>
          )}

          {impact.crons_affected.length > 0 && (
            <div style={s.chipRow}>
              {impact.crons_affected.map((cron, i) => (
                <Badge
                  key={`cron-${i}`}
                  icon="Clock"
                  mono
                  color="var(--warn)"
                  bg="var(--warn-bg)"
                >
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
      <div style={s.priorPrsRow}>
        <Icon.History size={14} />
        <span style={s.priorPrsLabel}>{t("priorPrsLabel")}</span>
        <span style={s.priorPrsNote}>{t("priorPrsUnavailable")}</span>
      </div>
    </section>
  );
}

/** One count in the stats strip. Number and label are separate nodes so the
 *  strip never collides with the per-symbol "{n} callers" text in tests. */
function Stat({
  icon,
  num,
  label,
}: {
  icon: "Code" | "CornerDownRight" | "Globe" | "Clock";
  num: number;
  label: string;
}) {
  const I = Icon[icon];
  return (
    <span style={s.statItem}>
      <I size={13} />
      <span className="tnum" style={s.statNum}>
        {num}
      </span>
      <span style={s.statLabel}>{label}</span>
    </span>
  );
}
