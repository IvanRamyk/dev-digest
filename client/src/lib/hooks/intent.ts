/* hooks/intent.ts — React Query hooks for the PR Intent Layer.
     GET  /pulls/:id/intent  → Intent | null   (the derived intent, or never-run)
     POST /pulls/:id/intent  → Intent          (derive / re-derive) */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { qk } from "../query-keys";
import type { Intent } from "../types";

/** GET /pulls/:id/intent — the stored intent for a PR (null until derived). */
export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: qk.pr(prId).intent,
    queryFn: () => api.get<Intent | null>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** POST /pulls/:id/intent — derive/re-derive; invalidates the intent read. */
export function useDerivePrIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Intent>(`/pulls/${prId}/intent`),
    onSuccess: (intent) => {
      // Seed the cache with the fresh intent, then invalidate so a background
      // refetch reconciles. The mutation owns its invalidation (C15).
      qc.setQueryData(qk.pr(prId).intent, intent);
      qc.invalidateQueries({ queryKey: qk.pr(prId).intent });
    },
  });
}
