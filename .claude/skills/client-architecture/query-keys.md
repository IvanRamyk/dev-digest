# Query keys and invalidation

Implements `C15` and `C16`. Sources: [README.md](README.md) §B.

## Why a factory

Keys are the cache's public API. Right now 15 key literals are spelled by hand across
five hook files, and two of them are also hand-written in a component
(`pulls/[number]/page.tsx:53,58`) so a page can invalidate what a mutation should have
invalidated itself. That is why the invalidation gaps below exist: nothing connects
the write to the reads it affects except somebody remembering.

Two properties fix it. A factory gives one place to change a key. Nesting keys under a
`repo`/`pr` root turns TanStack's default prefix matching into leverage — one
`qk.pr(prId).all` invalidates every PR-scoped query, so a mutation cannot silently
miss one.

## The target — `src/lib/query-keys.ts`

Generic → specific, each level independently usable. Covers every key live in the
codebase today.

```ts
/**
 * Query-key factory — the single source of truth for TanStack cache keys.
 * Keys are matched by prefix, so an outer level invalidates everything under it:
 * `qk.pr(id).all` covers runs, activeRuns, reviews, comments and the detail.
 * Never write a key literal outside this file (client-architecture C15).
 */
export const qk = {
  settings: ["settings"] as const,
  secretsStatus: ["secrets-status"] as const,
  providerModels: (provider?: string | null) =>
    provider ? (["provider-models", provider] as const) : (["provider-models"] as const),

  agents: {
    all: ["agents"] as const,
    detail: (id: string | null | undefined) => ["agents", "detail", id] as const,
  },

  repos: {
    all: ["repos"] as const,
    pulls: (repoId: string | null | undefined) => ["repos", repoId, "pulls"] as const,
    context: (repoId: string | null | undefined) => ["repos", repoId, "context"] as const,
    intel: (repoId: string | null | undefined) => ["repos", repoId, "intel"] as const,
  },

  pr: (prId: string | number | null | undefined) =>
    ({
      all: ["pr", prId] as const,
      detail: ["pr", prId, "detail"] as const,
      runs: ["pr", prId, "runs"] as const,
      activeRuns: ["pr", prId, "runs", "active"] as const,
      reviews: ["pr", prId, "reviews"] as const,
      comments: ["pr", prId, "comments"] as const,
    }) as const,

  runTrace: (runId: string | null | undefined) => ["run-trace", runId] as const,
};
```

Two shapes are deliberate. `providerModels` returns the bare prefix when called with
no argument, because `useTestConnection` invalidates *all* providers
(`core.ts:50`). `activeRuns` nests **under** `runs`, so invalidating `runs` also
covers the active subset — which is what most run mutations actually want.

## The invalidation matrix

Verified against each mutation's `onSuccess` on 2026-08-06.

| Mutation | Must invalidate | Today |
|---|---|---|
| `useCancelRun` (`reviews.ts:83`) | `pr.activeRuns`, `pr.runs`, `pr.reviews` | **nothing** — the page compensates |
| `useRunReview` (`reviews.ts:133`) | `pr.reviews`, `pr.runs`, `pr.activeRuns` | `reviews` only |
| `useFindingAction` (`reviews.ts:148`) | `pr.reviews`, `repos.pulls(repoId)` | `reviews`, and only if `prId` was passed |
| `useDeleteRun` (`reviews.ts:69`) | `pr.runs`, `pr.reviews`, `repos.pulls(repoId)` | first two ✓ |
| `useDeleteReview` (`reviews.ts:90`) | `pr.reviews`, `repos.pulls(repoId)` | `reviews` ✓ |
| `useCreatePrComment` (`reviews.ts:117`) | `pr.comments` | ✓ |
| `useRefreshRepo` (`core.ts:82`) | `repos.all`, `repos.pulls(repoId)` | ✓ |
| `useReindexContext` (`core.ts:131`) | `repos.context(repoId)` | ✓ |
| `useResyncRepoIntel` (`repo-intel.ts:41`) | `repos.intel(repoId)` | ✓ |
| `useTestConnection` (`core.ts:38`) | `providerModels()`, `secretsStatus` | ✓ |
| `useAddRepo` / `useDeleteRepo` | `repos.all` | ✓ |
| `useCreateAgent` | `agents.all` | ✓ |
| `useUpdateAgent` | `agents.all` + `setQueryData(agents.detail(id))` | ✓ |
| `useDeleteAgent` | `agents.all` + `removeQueries(agents.detail(id))` | ✓ |
| `useUpdateSettings` | `setQueryData(settings)` — not an invalidate | ✓ |

`repos.pulls(repoId)` appears wherever a write changes a PR's findings or severity
counts, because the PR list renders those counters per row. It is the most commonly
missed entry: the row goes stale while the detail page looks correct.

The nesting collapses most of these. `useCancelRun` needs one call:

```ts
export function useCancelRun(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.post<{ ok: boolean }>(`/runs/${runId}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.pr(prId).all }),
  });
}
```

Note the signature change: `useCancelRun` currently takes no arguments, which is
*why* it invalidates nothing — it has no `prId` to invalidate with. It must take
`prId` like its siblings `useDeleteRun(prId)` and `useDeleteReview(prId)` do.

## Three rules

1. **Keys only from the factory.** No `queryKey: [...]` literal outside
   `src/lib/query-keys.ts`. A component that needs to invalidate does not — see 2.
2. **The mutation owns its invalidation.** Every cache entry a write affects is
   invalidated in that mutation's `onSuccess`. When this holds,
   `pulls/[number]/page.tsx:52-59` loses both closures and the `onRunDone` /
   `onRunsStarted` props that thread them down the tree.
3. **One hook per key.** Two hooks sharing a key is a cache conflict, and
   `useQuery` cannot share a key with `useInfiniteQuery` at all — the cached shapes
   differ.

**Do not "fix" the `enabled` warming pattern.** `usePrRuns(prId, enabled)` and
`usePrReviews(prId, enabled)` are called per row in `PRRow.tsx:30,34` behind a hover
flag, deliberately, to warm the cache before navigation (documented at
`reviews.ts:41-43,57-59`). It looks like an N+1 and is not one; each row's data is
keyed separately and fetched at most once.

## Polling

`C16`: a poll self-quenches. The predicate belongs in the hook, and it reads the data
it is polling for.

```ts
// ✅ the exemplar — reviews.ts:33
refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? 4000 : false),

// ❌ the violation — core.ts:109, polls every 60s forever, in every open tab
refetchInterval: 60_000,
```

`usePulls` is the standing violation and the one `client/CLAUDE.md` **Gotchas** warns
about. It has no in-flight condition to test, which is the real problem: if the PR
list needs freshness it should invalidate on the events that change it (`useRefreshRepo`,
run completion) rather than poll on a timer.

One legitimate exception shape: `useRepoIntelStatus(repoId, poll = false)`
(`repo-intel.ts:36`) lets the *caller* own the flag, because only the caller knows an
indexing job was just started. That is still self-quenching — the caller passes
`false` when the job finishes. A caller-owned flag is fine; a constant is not.

The polling interval `4000` is duplicated at `reviews.ts:33` and `:50`. When
`query-keys.ts` lands, a `RUN_POLL_MS` beside it is the natural home — but only if it
is genuinely one concept. Two intervals that merely happen to be equal stay separate
(see `SKILL.md` "When not to split").
