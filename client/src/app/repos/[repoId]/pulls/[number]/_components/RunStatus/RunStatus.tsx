/* RunStatus — live SSE status for in-flight review runs. Subscribes to the
   run event streams and renders the shared LiveLogStream. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { LiveLogStream, type LogLine } from "@devdigest/ui";
import { useRunEvents } from "@/lib/hooks/reviews";
import { LOG_HEIGHT } from "./constants";
import { s } from "./styles";

export interface RunStatusProps {
  runIds: string[];
  /** Scope for cache invalidation when the runs settle — useRunEvents owns it. */
  prId?: string | null;
  repoId?: string | null;
}

export function RunStatus({ runIds, prId, repoId }: RunStatusProps) {
  const t = useTranslations("prReview");
  // The hook invalidates this PR's caches when the last stream closes (C15), so
  // there is no onDone callback to thread back up through the tree.
  const { events, running } = useRunEvents(runIds, { prId, repoId });

  if (runIds.length === 0) return null;

  const log: LogLine[] = events.map((e) => ({
    t: e.t,
    k: e.kind as LogLine["k"],
    m: e.msg,
  }));

  return (
    <div style={s.wrap}>
      <LiveLogStream
        log={log}
        running={running}
        height={LOG_HEIGHT}
        elapsedLabel={running ? t("runStatus.elapsed", { count: runIds.length }) : undefined}
      />
    </div>
  );
}
