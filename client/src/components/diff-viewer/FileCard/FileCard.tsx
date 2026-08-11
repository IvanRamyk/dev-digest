/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, type Severity } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { parsePatch, type Line } from "@/lib/domain/diff";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export interface FileCardProps {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** Controlled open state. When provided, the card no longer owns its own
      open/closed state and defers to `open` + `onToggle` (Smart Diff drives
      every card's open state so a finding badge can expand its file). */
  open?: boolean;
  onToggle?: () => void;
  /** Smart Diff: per-line (new-side line number) → worst severity touching it. */
  marks?: ReadonlyMap<number, Severity>;
  /** Smart Diff: rendered at the right of the header (finding dot + count). */
  headerRight?: React.ReactNode;
  /** Smart Diff: prefix for each row's DOM id, unique when two viewers coexist. */
  lineIdPrefix?: string;
}

export function FileCard({
  file,
  commenting,
  open: openProp,
  onToggle,
  marks,
  headerRight,
  lineIdPrefix,
}: FileCardProps) {
  const t = useTranslations("shell");
  // Uncontrolled by default (today's behaviour); controlled when `open` is passed.
  const [openState, setOpenState] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const toggle = controlled ? onToggle : () => setOpenState((o) => !o);
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={toggle} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {headerRight}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                mark={ln.newNo != null ? marks?.get(ln.newNo) : undefined}
                lineIdPrefix={lineIdPrefix}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
