/* hooks/skills.ts — React Query hooks for the Skills Lab + agent Skills tab.
   Mirrors the shape of hooks/agents.ts exactly (C14). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { qk } from "../query-keys";
import type { Skill, SkillType } from "@devdigest/shared";

export interface SkillVersion {
  skill_id: string;
  version: number;
  body: string;
  created_at: string;
}

/** A skipped archive entry from an import preview — route-local, not a shared contract. */
export interface SkippedEntry {
  path: string;
  bytes: number;
  reason: "not_processed" | "unsafe_path";
}

/** `POST /skills/import/preview` response — persists nothing. */
export interface SkillImportPreview {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source: "manual" | "imported_url" | "extracted" | "community";
  skipped: SkippedEntry[];
}

export function useSkills() {
  return useQuery({
    queryKey: qk.skills.all,
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.skills.detail(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.skills.versions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description?: string;
  type?: SkillType;
  body: string;
  enabled?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.skills.all }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.skills.all });
      qc.setQueryData(qk.skills.detail(data.id), data);
      qc.invalidateQueries({ queryKey: qk.skills.versions(data.id) });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: qk.skills.all });
      qc.removeQueries({ queryKey: qk.skills.detail(id) });
    },
  });
}

export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: qk.skills.all });
      qc.setQueryData(qk.skills.detail(data.id), data);
      qc.invalidateQueries({ queryKey: qk.skills.versions(data.id) });
    },
  });
}

/** Preview an import from an uploaded `.md`/`.zip` — persists nothing server-side. */
export function usePreviewImport() {
  return useMutation({
    mutationFn: (input: { filename: string; content_base64: string }) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

/** Confirm a previewed import — the only call that persists it. */
export function useImportSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (preview: SkillImportPreview) => api.post<Skill>("/skills/import", preview),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.skills.all }),
  });
}
