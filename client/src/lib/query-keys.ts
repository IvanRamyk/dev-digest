/* query-keys.ts — the single source of truth for TanStack cache keys.
   Keys are matched by PREFIX, so an outer level invalidates everything nested
   under it: `qk.pr(id).all` covers that PR's detail, runs, active runs, reviews
   and comments in one call. Structure runs generic → specific.

   Never write a key literal outside this file, and never call invalidateQueries
   from a component — the mutation that performs the write owns its invalidation.
   See .claude/skills/client-architecture/query-keys.md (C15). */

export const qk = {
  // ---- Settings & secrets ----
  settings: ["settings"] as const,
  secretsStatus: ["secrets-status"] as const,

  /** Called with no argument, returns the bare prefix — useTestConnection
      invalidates every provider's model list at once. */
  providerModels: (provider?: string | null) =>
    provider ? (["provider-models", provider] as const) : (["provider-models"] as const),

  // ---- Agents ----
  agents: {
    all: ["agents"] as const,
    detail: (id: string | null | undefined) => ["agents", "detail", id] as const,
  },

  // ---- Repos and their sub-resources ----
  repos: {
    all: ["repos"] as const,
    pulls: (repoId: string | null | undefined) => ["repos", repoId, "pulls"] as const,
    context: (repoId: string | null | undefined) => ["repos", repoId, "context"] as const,
    intel: (repoId: string | null | undefined) => ["repos", repoId, "intel"] as const,
  },

  /** Everything scoped to one pull request. `activeRuns` nests under `runs`, so
      invalidating `runs` also covers the active subset — which is what most run
      mutations want. */
  pr: (prId: string | number | null | undefined) =>
    ({
      all: ["pr", prId] as const,
      detail: ["pr", prId, "detail"] as const,
      runs: ["pr", prId, "runs"] as const,
      activeRuns: ["pr", prId, "runs", "active"] as const,
      reviews: ["pr", prId, "reviews"] as const,
      comments: ["pr", prId, "comments"] as const,
    }) as const,

  // ---- Run trace (keyed by run, not by PR) ----
  runTrace: (runId: string | null | undefined) => ["run-trace", runId] as const,
};
