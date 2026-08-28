/* hooks/blast.ts — React Query hook for the PR Blast Radius.
     GET /pulls/:id/blast → BlastRadius (impact map, read-only) */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { qk } from "../query-keys";
import type { BlastRadius } from "../types";

/** GET /pulls/:id/blast — the PR's impact map (changed symbols → callers). */
export function usePrBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: qk.pr(prId).blast,
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
