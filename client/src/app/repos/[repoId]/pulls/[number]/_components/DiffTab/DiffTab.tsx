"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Chip } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile, SmartDiff, FindingRecord } from "@devdigest/shared";
import { SmartDiffViewer } from "../SmartDiffViewer";
import { s } from "./styles";

export interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Reviewer-ordered groups. Undefined while loading or on error → falls back
      to the flat DiffViewer (graceful degradation; never an error state). */
  smartDiff?: SmartDiff;
  /** Live findings, for the Smart Diff per-line severity marks. */
  findings: FindingRecord[];
  /** 'smart' or 'original' — the diff ordering, URL-backed (?order). */
  order: string;
  onSetOrder: (next: string) => void;
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({
  prId,
  filesCount,
  files,
  smartDiff,
  findings,
  order,
  onSetOrder,
  canComment,
}: DiffTabProps) {
  const t = useTranslations("shell");
  const ts = useTranslations("prReview.smartDiff");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : t("diffViewer.postFailed"));
        throw err;
      }
    },
  };

  // Smart order is the default, but a failed/loading classification must never
  // hide the diff — degrade to the flat DiffViewer rather than an error state.
  const showSmart = order === "smart" && !!smartDiff;

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={s.controls}>
            <div style={s.orderToggle}>
              <Chip active={order === "smart"} onClick={() => onSetOrder("smart")}>
                {ts("smartOrder")}
              </Chip>
              <Chip active={order === "original"} onClick={() => onSetOrder("original")}>
                {ts("originalOrder")}
              </Chip>
            </div>
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? t("diffViewer.hideComments") : t("diffViewer.showComments")} (
                {commentCount})
              </Button>
            )}
          </div>
        }
      >
        {t("diffViewer.filesChanged", { count: filesCount })}
      </SectionLabel>

      {showSmart ? (
        <SmartDiffViewer
          smartDiff={smartDiff}
          files={files}
          findings={findings}
          commenting={commenting}
        />
      ) : (
        <DiffViewer files={files} commenting={commenting} />
      )}
    </section>
  );
}
