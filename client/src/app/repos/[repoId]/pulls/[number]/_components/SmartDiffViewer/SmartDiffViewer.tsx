/* SmartDiffViewer — reviewer-ordered diff: the server's core/wiring/boilerplate
   groups rendered in order, each file carrying its finding marks and a
   "jump to finding" badge, plus the "PR is large" split-suggestion card.

   A VIEW, not a fetcher (C14): it takes the already-loaded smartDiff, the
   PrDetail files (for patch bodies), the live findings (for severity marks), and
   the optional inline-comment API. It owns only per-file open state and the
   scroll-to-finding gesture. Groups render in the SERVER's order — no client-side
   re-sorting, or the two ends drift. */
"use client";

import React from "react";
import type { PrFile, SmartDiff, FindingRecord } from "@devdigest/shared";
import type { DiffCommentApi } from "@/components/diff-viewer";
import { SmartDiffGroupSection } from "./_components/SmartDiffGroupSection";
import { SmartDiffSplitSuggestion } from "./_components/SmartDiffSplitSuggestion";
import { DEFAULT_EXPANDED_ROLES } from "./constants";
import { filesByPath } from "./helpers";
import { s } from "./styles";

export interface SmartDiffViewerProps {
  smartDiff: SmartDiff;
  /** PrDetail files — the patch bodies Smart Diff itself does not carry. */
  files: PrFile[];
  /** Live findings across the PR, for severity marks + counts. */
  findings: FindingRecord[];
  /** Inline commenting, forwarded to each FileCard (offered on open PRs). */
  commenting?: DiffCommentApi;
}

/** Paths that start expanded: every file in a DEFAULT_EXPANDED_ROLES group, plus
    any file with findings — so boilerplate stays collapsed unless it has one. */
function initialOpenPaths(smartDiff: SmartDiff): Set<string> {
  const open = new Set<string>();
  for (const group of smartDiff.groups) {
    const roleExpands = DEFAULT_EXPANDED_ROLES.includes(group.role);
    for (const file of group.files) {
      if (roleExpands || file.finding_lines.length > 0) open.add(file.path);
    }
  }
  return open;
}

export function SmartDiffViewer({ smartDiff, files, findings, commenting }: SmartDiffViewerProps) {
  const byPath = React.useMemo(() => filesByPath(files), [files]);

  // Per-file open state, keyed by path. Re-initialised whenever the groups
  // change (a fresh smartDiff response) so a new file lands with its role's
  // default rather than sticking closed.
  const [openByPath, setOpenByPath] = React.useState<ReadonlyMap<string, boolean>>(() => {
    const m = new Map<string, boolean>();
    for (const p of initialOpenPaths(smartDiff)) m.set(p, true);
    return m;
  });
  React.useEffect(() => {
    setOpenByPath(() => {
      const m = new Map<string, boolean>();
      for (const p of initialOpenPaths(smartDiff)) m.set(p, true);
      return m;
    });
  }, [smartDiff]);

  const onToggle = React.useCallback((path: string) => {
    setOpenByPath((prev) => {
      const next = new Map(prev);
      next.set(path, !(prev.get(path) ?? false));
      return next;
    });
  }, []);

  // Open the file, then (once the open-state update has committed and the row
  // exists) scroll the finding line into view. The rAF is load-bearing: the
  // target row is not in the DOM until the open toggle renders.
  const onJumpToFinding = React.useCallback((path: string, line: number) => {
    setOpenByPath((prev) => {
      if (prev.get(path)) return prev;
      const next = new Map(prev);
      next.set(path, true);
      return next;
    });
    requestAnimationFrame(() => {
      document
        .getElementById(`${path}-${line}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, []);

  return (
    <div style={s.root}>
      <SmartDiffSplitSuggestion split={smartDiff.split_suggestion} />
      {smartDiff.groups.map((group) => (
        <SmartDiffGroupSection
          key={group.role}
          group={group}
          filesByPath={byPath}
          findings={findings}
          commenting={commenting}
          openByPath={openByPath}
          onToggle={onToggle}
          onJumpToFinding={onJumpToFinding}
        />
      ))}
    </div>
  );
}
