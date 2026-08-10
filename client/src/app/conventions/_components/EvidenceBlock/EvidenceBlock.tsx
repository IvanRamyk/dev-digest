/* EvidenceBlock — mono `path:start-end` + a <pre> snippet + a copy button.
   Pure display: the server already re-derived the snippet from disk, so this
   component never re-fetches or re-verifies anything. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { IconBtn } from "@devdigest/ui";
import { s } from "./styles";

export function EvidenceBlock({
  path,
  startLine,
  endLine,
  snippet,
}: {
  path: string;
  startLine: number | null;
  endLine: number | null;
  snippet: string;
}) {
  const t = useTranslations("conventions");
  const [copied, setCopied] = React.useState(false);

  const location =
    startLine != null
      ? `${path}:${startLine}${endLine != null && endLine !== startLine ? `-${endLine}` : ""}`
      : path;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — silently ignore */
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <span className="mono" style={s.location}>
          {location}
        </span>
        {snippet && (
          <IconBtn
            icon={copied ? "Check" : "Copy"}
            label={copied ? t("card.copied") : t("card.copyEvidence")}
            size={22}
            onClick={copy}
          />
        )}
      </div>
      {snippet && <pre style={s.pre}>{snippet}</pre>}
    </div>
  );
}
