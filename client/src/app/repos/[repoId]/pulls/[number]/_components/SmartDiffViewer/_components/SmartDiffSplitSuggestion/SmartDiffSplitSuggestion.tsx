/* SmartDiffSplitSuggestion — the "this PR is large, consider splitting" card.
   Renders only when the server flags `too_big`. Split names are directory
   prefixes authored by the server (never prose), so they are shown verbatim. */
"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SmartDiff } from "@devdigest/shared";
import { s } from "./styles";

export function SmartDiffSplitSuggestion({
  split,
}: {
  split: SmartDiff["split_suggestion"];
}) {
  const t = useTranslations("prReview.smartDiff");
  if (!split.too_big) return null;

  return (
    <div style={s.card}>
      <div style={s.head}>
        <Icon.AlertTriangle size={15} style={{ color: "var(--warn)" }} />
        <span style={s.title}>{t("largeTitle", { lines: split.total_lines })}</span>
      </div>
      <span style={s.body}>{t("largeBody")}</span>
      {split.proposed_splits.length > 0 && (
        <ul style={s.splits}>
          {split.proposed_splits.map((sp) => (
            <li key={sp.name} style={s.split}>
              <span className="mono" style={s.splitName}>
                {sp.name}
              </span>
              <span className="mono" style={s.splitFiles}>
                {sp.files.map((f) => (
                  <span key={f}>{f}</span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
