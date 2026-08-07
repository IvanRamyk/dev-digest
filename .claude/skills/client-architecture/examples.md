# Examples — bad→good, from this repo

Every pair is real code at the cited `path:line`, verified 2026-08-06. Paths are
relative to `client/`. Rule ids refer to [SKILL.md](SKILL.md).

---

## 1. `[C3]` A page that does the work

`src/app/repos/[repoId]/pulls/[number]/page.tsx` — 195 lines: six hooks, a
number→uuid resolution, two invalidation closures, URL state, a memoized derivation,
and two inline layout blocks.

```tsx
// BAD — page.tsx:36-59 (abridged)
const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
const prId = pulls?.find((p) => p.number === Number(number))?.id ?? null;
const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);
const { data: reviews, refetch: refetchReviews } = usePrReviews(prId);
const qc = useQueryClient();
const { data: activeRuns } = usePrActiveRuns(prId);
const { data: prRuns } = usePrRuns(prId);
const deleteRun = useDeleteRun(prId);
const cancel = useCancelRun();
const invalidateActiveRuns = () => {
  if (prId) qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
};
const invalidateRunHistory = () => {
  if (prId) qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
};
const allFindings = React.useMemo(
  () => latestPerAgentRuns(runs, prRuns ?? []).flatMap((r) => r.findings),
  [runs, prRuns],
);
```

```tsx
// GOOD — the page composes; a colocated hook wires
export default function PRDetailPage() {
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  const vm = usePrDetailPage(repoId, number);   // ./_components/hooks/usePrDetailPage.ts

  if (vm.repoNotFound) return <RepoNotFound repoId={repoId} />;
  if (vm.isLoading) return <PrDetailSkeleton />;
  if (vm.isError) return <PrDetailError error={vm.error} onRetry={vm.refetch} />;

  return (
    <AppShell crumb={vm.crumb}>
      <PrDetailHeader {...vm.header} />
      <PrDetailTabs tab={vm.tab} onTab={vm.setTab} vm={vm} />
    </AppShell>
  );
}
```

The two closures disappear entirely once `useCancelRun` and `useRunReview` invalidate
their own writes (`C15`) — they exist only to patch under-invalidating mutations. Note
the fix is a **hook**, not a container component: a wrapper whose only job is to call a
hook earns nothing (see [README.md](README.md) §D).

---

## 2. `[C7]` `[C12]` Domain logic behind a component's barrel

```tsx
// BAD — page.tsx:13
import { latestPerAgentRuns } from "@/components/severity-counts";
```

A tier-4 page imports a business rule — one whose own doc comment says it *"mirrors
the server's `findings_by_severity` (`server/src/modules/pulls/routes.ts`)"* — from a
tier-3 UI component folder, because `severity-counts/index.ts:3` re-exports it.

```ts
// GOOD — src/lib/domain/reviews.ts (tier 1: pure, tested, no React)
/** … Mirrors the server's findings_by_severity (server/src/modules/pulls/routes.ts). */
export function latestPerAgentRuns(reviews: ReviewRecord[], runs: RunSummary[]): ReviewRecord[]
export function severityTally(reviews: ReviewRecord[]): SeverityCounts
export function totalOf(counts: SeverityCounts | null): number

// src/components/severity-counts/index.ts — component and props type, nothing else
export { SeverityCounts, default } from "./SeverityCounts";
export type { SeverityCountsProps } from "./SeverityCounts";

// page.tsx
import { latestPerAgentRuns } from "@/lib/domain/reviews";
```

The helper was well written — 16 lines of doc comment naming its server counterpart.
Nothing about it was wrong except its tier.

---

## 3. `[C15]` A hand-written key

```ts
// BAD — page.tsx:53,58 — the page spells keys owned by usePrActiveRuns / usePrRuns
if (prId) qc.invalidateQueries({ queryKey: ["pr-active-runs", prId] });
if (prId) qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
```

```ts
// GOOD — the mutation invalidates, using the factory
onSuccess: () => qc.invalidateQueries({ queryKey: qk.pr(prId).all }),
```

---

## 4. `[C15]` A mutation that invalidates nothing

```ts
// BAD — src/lib/hooks/reviews.ts:83-87
export function useCancelRun() {
  return useMutation({
    mutationFn: (runId: string) => api.post<{ ok: boolean }>(`/runs/${runId}/cancel`),
  });
}
```

Cancelling changes the active-run list, the run history, and the reviews — and the
cache learns none of it. It cannot: with no `prId` parameter there is nothing to
invalidate *with*. Its siblings `useDeleteRun(prId)` and `useDeleteReview(prId)`
already take one.

```ts
// GOOD
export function useCancelRun(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.post<{ ok: boolean }>(`/runs/${runId}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.pr(prId).all }),
  });
}
```

Full matrix, including `useRunReview` and `useFindingAction`:
[query-keys.md](query-keys.md).

---

## 5. `[C16]` A poll that never quenches

```ts
// BAD — src/lib/hooks/core.ts:109 — every 60s, forever, in every open tab
refetchInterval: 60_000,
```

```ts
// GOOD — src/lib/hooks/reviews.ts:33 — the predicate reads what it polls for
refetchInterval: (query) => ((query.state.data?.length ?? 0) > 0 ? 4000 : false),
```

`usePulls` has no in-flight condition to test, which is the real diagnosis: it should
be invalidated by the events that change it, not polled on a timer.

---

## 6. `[C13]` A re-declared token map — and the bug it caused

```ts
// BAD — _components/RunTraceDrawer/_components/FindingsSection/FindingsSection.tsx:12-16
const SEV_COLOR: Record<string, string> = {
  CRITICAL: "var(--crit)",
  WARNING: "var(--warn)",
  SUGGESTION: "var(--accent)",   // ← everywhere else this is var(--sugg)
};
```

The canonical map already exists at `src/vendor/ui/primitives/tokens.ts:6-14`:

```ts
// src/vendor/ui/primitives/tokens.ts — SEV, with colour, background, icon and label
SUGGESTION: { c: "var(--sugg)", bg: "var(--sugg-bg)", icon: "Lightbulb", label: "Suggestion" },
```

```tsx
// GOOD
import { SEV, type Severity } from "@devdigest/ui";
const meta = SEV[f.severity as Severity];
```

A local `Record<string, string>` typechecks perfectly, so nothing caught the drift.
`FindingCard/constants.ts:4-9` is a third copy — correct colours, still a copy, and it
will drift the same way. Note `SEV` also carries `bg`, `icon` and `label`, so adopting
it deletes more than the colour line.

---

## 7. `[C12]` A duplicated constant — and one that must NOT be merged

```ts
// BAD — byte-identical in two files
// _components/FindingsPanel/constants.ts:4-9
// src/components/findings-hover-card/constants.ts:16-21
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0, WARNING: 1, SUGGESTION: 2, INFO: 3,
};
```

```ts
// GOOD — src/lib/domain/findings.ts (two consumers, and it encodes a real rule)
/** Sort weight per severity (lower = shown first). */
export const SEVERITY_ORDER: Record<string, number> = { … };
export function sortBySeverity<T extends { severity: string }>(items: T[]): T[]
```

**The counter-example — do not merge these.** Same name, different concepts:

```ts
_components/RunTraceDrawer/constants.ts:7   export const LOG_HEIGHT = 420;  // drawer log pane
_components/RunStatus/constants.ts:4        export const LOG_HEIGHT = 200;  // inline status strip
```

Two independent layout decisions that happen to share a name. A dedup pass that
promotes them to one constant with a parameter is the Wrong Abstraction arriving on
schedule (see [README.md](README.md) §D). `C12` promotes *rules*, not coincidences.

---

## 8. `[C9]` Inline styles, one step from correct

`RunHistory.tsx` declares three module-level `React.CSSProperties` objects
(`:41`, `:53`, `:68`) plus 14 inline `style={{ … }}` — and has no `styles.ts` at all.
It is the closest-to-correct violation in the repo, which makes it the clearest case.

```tsx
// BAD — RunHistory.tsx:41-51 + inline literals in JSX
const rowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, width: "100%",
  padding: "10px 14px", borderRadius: 8,
  border: "1px solid var(--border)", background: "var(--bg-elevated)",
  textAlign: "left",
};
```

```ts
// GOOD — RunHistory/styles.ts, one export named s; variants are functions
import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "flex", alignItems: "center", gap: 12, width: "100%",
    padding: "10px 14px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--bg-elevated)",
    textAlign: "left",
  } satisfies CSSProperties,

  commitRow: { /* … dashed, transparent — a marker, not an action */ } satisfies CSSProperties,

  iconBtn: (disabled: boolean): CSSProperties => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    padding: 4, borderRadius: 5,
    border: "1px solid var(--border)", background: "var(--bg-surface)",
    color: "var(--text-muted)",
    cursor: disabled ? "not-allowed" : "pointer",
    flexShrink: 0,
  }),
};
```

Colours stay `var(--token)` — that is what makes the theme toggle work. This folder
also has no `index.ts`, so consumers import the file directly
(`FindingsTab.tsx:6` → `"../RunHistory/RunHistory"`), which `C5` fixes in the same pass.

---

## 9. `[C10]` Untranslated strings the eye skips

```tsx
// BAD — _components/ReviewRunAccordion/ReviewRunAccordion.tsx:117-118
title="Delete this review run"
aria-label="Delete this review run"

// BAD — _components/AgentCard/AgentCard.tsx:47-48 — in a file that already has t()
title="Delete agent"
aria-label="Delete agent"
```

```tsx
// GOOD — constants.ts holds the key; the component resolves it
// AgentCard/constants.ts
export const DELETE_LABEL_KEY = "card.deleteAgent";

// AgentCard.tsx
const t = useTranslations("agents");
title={t(DELETE_LABEL_KEY)}
aria-label={t(DELETE_LABEL_KEY)}
```

`AgentCard.tsx:26` already calls `useTranslations("agents")` — the string was simply
missed. This is the repo's systematic gap: happy-path copy is translated, while
`aria-label`, `title`, and error/empty-state bodies are not. `ReviewRunAccordion`
calls `useTranslations` nowhere at all.

---

## 10. `[C6]` The self-referential barrel

No violation exists in the repo today — this pair is prophylactic, so don't go looking
for the bad case.

```ts
// BAD — inside FindingCard/, importing through the folder's own barrel
import { s } from ".";              // FindingCard/index.ts → FindingCard.tsx → index.ts
```

```ts
// GOOD — siblings directly
import { s } from "./styles";
import { SEV_COLOR } from "./constants";
```

Editors auto-generate the bad form, and the resulting cycle surfaces as a confusing
bundler error rather than a clear one — see [README.md](README.md) §C.
