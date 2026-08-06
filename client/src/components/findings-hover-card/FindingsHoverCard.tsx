/* FindingsHoverCard — hover a severity counter, see the findings behind it.
   Used on the PR list's FINDINGS column and on each Agent runs timeline row.
   The design system has no popover primitive (only native title=), so this lives
   here rather than as an addition to vendor/ui. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Icon, CategoryTag, ConfidenceNum, SEV, type Category, type Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { POPOVER_MAX_ITEMS, POPOVER_OFFSET, POPOVER_WIDTH } from "./constants";
import { fileLabel, rationalePreview, sortBySeverity } from "./helpers";
import { s } from "./styles";

export interface FindingsHoverCardProps {
  findings: FindingRecord[];
  /** Card heading, e.g. "6 findings" or "2 findings in this run". */
  title: string;
  /** True while the findings are still being fetched. */
  loading?: boolean;
  /** Called on hover — lets the host defer its fetch until the card is wanted. */
  onHoverChange?: (hovered: boolean) => void;
  children: React.ReactNode;
}

/**
 * Portalled to <body> with `position: fixed` on purpose. The PR list's table card
 * sets `overflow: hidden` (pulls/styles.ts), which would clip an absolutely
 * positioned card inside a row — badly on the last rows.
 *
 * The card is `pointer-events: none` and shows on hover only: it is a preview of
 * data the row already links to, never a click target. That keeps the PR row a
 * single navigation target.
 */
export function FindingsHoverCard({
  findings,
  title,
  loading = false,
  onHoverChange,
  children,
}: FindingsHoverCardProps) {
  const t = useTranslations("prReview");
  const anchorRef = React.useRef<HTMLSpanElement | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  const show = () => {
    onHoverChange?.(true);
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Flip left when the card would run off the right edge; flip above when it
    // would run off the bottom (the last rows of a long list).
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
    const below = rect.bottom + POPOVER_OFFSET;
    const estimatedHeight = 60 + Math.min(findings.length, POPOVER_MAX_ITEMS) * 74;
    const top =
      below + estimatedHeight > window.innerHeight
        ? Math.max(8, rect.top - POPOVER_OFFSET - estimatedHeight)
        : below;
    setPos({ top, left });
  };

  const hide = () => {
    onHoverChange?.(false);
    setPos(null);
  };

  const shown = sortBySeverity(findings).slice(0, POPOVER_MAX_ITEMS);
  const hiddenCount = findings.length - shown.length;

  const card = pos && (
    <div style={s.card(pos.top, pos.left)} role="tooltip">
      <div style={s.header}>
        <Icon.AlertOctagon size={12} />
        {title}
      </div>
      {loading && findings.length === 0 ? (
        <div style={s.empty}>{t("findingsPopover.loading")}</div>
      ) : findings.length === 0 ? (
        <div style={s.empty}>{t("findingsPopover.empty")}</div>
      ) : (
        <>
          <div style={s.list}>
            {shown.map((f) => {
              const meta = SEV[f.severity as Severity];
              const SevIcon = Icon[meta.icon];
              return (
                <div key={f.id} style={s.item}>
                  <div style={s.itemTitleRow}>
                    <SevIcon size={13} style={s.itemIcon(meta.c)} />
                    <span style={s.itemTitle}>{f.title}</span>
                    <CategoryTag category={f.category as Category} />
                  </div>
                  <div style={s.itemMetaRow}>
                    <span className="mono" style={s.itemFile}>
                      {fileLabel(f)}
                    </span>
                    <ConfidenceNum value={f.confidence} />
                  </div>
                  <div style={s.itemRationale}>{rationalePreview(f.rationale)}</div>
                </div>
              );
            })}
          </div>
          {hiddenCount > 0 && (
            <div style={s.footer}>{t("findingsPopover.more", { count: hiddenCount })}</div>
          )}
        </>
      )}
    </div>
  );

  return (
    <span
      ref={anchorRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      style={s.anchor}
    >
      {children}
      {card && typeof document !== "undefined" && createPortal(card, document.body)}
    </span>
  );
}

export default FindingsHoverCard;
