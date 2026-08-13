"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrIntent, useDerivePrIntent } from "@/lib/hooks/intent";
import { s } from "./styles";
import { NS, CONFIDENCE_COLOR, SOURCE_COLOR } from "./constants";

interface IntentCardProps {
  prId: string;
}

/**
 * Route-private card that surfaces the server-derived PR intent & scope. Rendered
 * before the description so the reviewer verifies the machine's understanding
 * first. All data flows through hooks (C14); the Re-run mutation owns its own
 * cache invalidation (C15).
 */
export function IntentCard({ prId }: IntentCardProps) {
  const t = useTranslations(NS);
  const { data: intent, isLoading, isError } = usePrIntent(prId);
  const derive = useDerivePrIntent(prId);

  const rerunButton = (
    <Button
      kind="tertiary"
      size="sm"
      icon="RefreshCw"
      loading={derive.isPending}
      disabled={derive.isPending}
      aria-label={t("rerunAria")}
      onClick={() => derive.mutate()}
    >
      {t("rerun")}
    </Button>
  );

  const header = (
    <div style={s.headerRow}>
      <div style={s.headerLeft}>
        <SectionLabel icon="Target">{t("sectionLabel")}</SectionLabel>
        {intent && (
          <Badge
            color={CONFIDENCE_COLOR[intent.confidence].color}
            bg={CONFIDENCE_COLOR[intent.confidence].bg}
          >
            {t("confidence", { level: intent.confidence })}
          </Badge>
        )}
      </div>
      {rerunButton}
    </div>
  );

  if (isLoading) {
    return (
      <section style={s.card}>
        {header}
        <Skeleton height={16} width={360} />
        <Skeleton height={48} />
      </section>
    );
  }

  if (isError) {
    return (
      <section style={s.card}>
        {header}
        <div role="alert" style={s.empty}>
          {t("loadError")}
        </div>
      </section>
    );
  }

  if (!intent) {
    return (
      <section style={s.card}>
        {header}
        <div style={s.empty}>{t("empty")}</div>
      </section>
    );
  }

  return (
    <section style={s.card}>
      {header}

      <div style={s.summary}>{intent.intent}</div>

      <div style={s.scopeGrid}>
        <div>
          <div style={s.scopeLabel}>{t("inScope")}</div>
          <ul style={s.list}>
            {intent.in_scope.map((item, i) => (
              <li key={`in-${i}`}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <div style={s.scopeLabel}>{t("outOfScope")}</div>
          <ul style={s.list}>
            {intent.out_of_scope.map((item, i) => (
              <li key={`out-${i}`}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      {intent.sources.length > 0 && (
        <div>
          <div style={s.scopeLabel}>{t("sources")}</div>
          <div style={s.sourcesRow}>
            {intent.sources.map((src, i) => (
              <Badge key={`src-${i}`} dot color={SOURCE_COLOR[src.status]}>
                {`${src.type}: ${src.ref} · ${t(`sourceStatus.${src.status}`)}`}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {intent.missing_context.length > 0 && (
        <div role="alert" style={s.missingBox}>
          {t("missingContext")}
          <ul style={s.missingList}>
            {intent.missing_context.map((note, i) => (
              <li key={`miss-${i}`}>{note}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
