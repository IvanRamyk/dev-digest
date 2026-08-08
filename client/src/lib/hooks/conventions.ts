/* hooks/conventions.ts — React Query hooks for the Conventions Extractor.
     GET  /repos/:id/conventions                 → { scan, candidates }
     POST /repos/:id/conventions/scan            → 202 { scan_id, job_id } | { scan_id, degraded, reason }
     GET  /repos/:id/conventions/scan             → ConventionScan | null   (poll target)
     PUT  /conventions/:id                        → ConventionCandidate    (accept/reject/un-decide/edit)
     POST /repos/:id/conventions/bulk-status       → { updated }
     POST /repos/:id/conventions/skill-preview     → SkillPreviewDto        (persists nothing) */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { qk } from "../query-keys";
import type { ConventionCandidate, ConventionScan, ConventionStatus } from "../types";

export interface ConventionsView {
  scan: ConventionScan | null;
  candidates: ConventionCandidate[];
}

export interface StartScanResult {
  scan_id: string;
  job_id?: string;
  degraded?: true;
  reason?: string;
}

export interface SkillPreview {
  name: string;
  description: string;
  type: "convention";
  body: string;
  candidate_count: number;
}

/** GET /repos/:id/conventions — the candidate list plus the latest scan. */
export function useConventions(repoId: string | null | undefined, status: ConventionStatus | "all" = "all") {
  return useQuery({
    queryKey: [...qk.conventions.list(repoId), status] as const,
    queryFn: () => api.get<ConventionsView>(`/repos/${repoId}/conventions?status=${status}`),
    enabled: !!repoId,
  });
}

/** GET /repos/:id/conventions/scan — self-quenching poll: refetches every 1.5s
    while a scan is queued/running, stops once it lands done/failed. */
export function useConventionScan(repoId: string | null | undefined) {
  return useQuery({
    queryKey: qk.conventions.scan(repoId),
    queryFn: () => api.get<ConventionScan | null>(`/repos/${repoId}/conventions/scan`),
    enabled: !!repoId,
    refetchInterval: (query) =>
      query.state.data?.status === "queued" || query.state.data?.status === "running" ? 1500 : false,
  });
}

/** POST /repos/:id/conventions/scan — kick off (or return the already-active) scan. */
export function useStartConventionScan(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<StartScanResult>(`/repos/${repoId}/conventions/scan`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.conventions.all(repoId) });
    },
  });
}

/** PUT /conventions/:id — accept/reject/un-decide and/or edit the rule text.
    Optimistic: the card flips state immediately, rolls back on error. */
export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { status?: ConventionStatus; rule?: string } }) =>
      api.put<ConventionCandidate>(`/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.conventions.all(repoId) });
      const previous = qc.getQueriesData<ConventionsView>({ queryKey: qk.conventions.list(repoId) });
      qc.setQueriesData<ConventionsView>({ queryKey: qk.conventions.list(repoId) }, (view) =>
        view
          ? {
              ...view,
              candidates: view.candidates.map((c) => (c.id === id ? { ...c, ...patch } : c)),
            }
          : view,
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      for (const [key, data] of context?.previous ?? []) qc.setQueryData(key, data);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.conventions.list(repoId) });
    },
  });
}

/** POST /repos/:id/conventions/bulk-status — "Deselect all" / bulk reject. */
export function useBulkUpdateConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: ConventionStatus }) =>
      api.post<{ updated: number }>(`/repos/${repoId}/conventions/bulk-status`, { ids, status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.conventions.list(repoId) });
    },
  });
}

/** POST /repos/:id/conventions/skill-preview — a MUTATION (not a query): fired
    on modal open so the preview always reflects the latest inline edits, and
    never lands in the query cache (it persists nothing server-side). */
export function useConventionSkillPreview(repoId: string | null | undefined) {
  return useMutation({
    mutationFn: () => api.post<SkillPreview>(`/repos/${repoId}/conventions/skill-preview`),
  });
}
