"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { s } from "./styles";
import { IntentCard } from "./_components/IntentCard";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
}

export function OverviewTab({ prId, prBody }: OverviewTabProps) {
  return (
    <>
      {/* Intent & scope first — the reviewer verifies the machine's
          understanding of the PR before reading the description/results. */}
      {prId && <IntentCard prId={prId} />}

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
