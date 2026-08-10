# Placement — where does X go?

Operational companion to [SKILL.md](SKILL.md). Tier names and the import direction
are defined there.

## The decision table

| I have… | Tier · path | File | Promotes when |
|---|---|---|---|
| JSX used by one route | 4 · that route's `_components/<Name>/` | `<Name>.tsx` | a **second route** consumes it → `src/components/<kebab-case>/` |
| JSX used by 2+ routes | 3 · `src/components/<kebab-case>/` | `<Name>.tsx` | — |
| a child of one component | 4 · `<Parent>/_components/<Child>/` | `<Child>.tsx` | it outlives the parent → up one level |
| a magic number or literal | that folder | `constants.ts` | 2 folders need it → `src/lib/domain/` or `@devdigest/ui` |
| a user-visible string | — | `messages/en/<ns>.json` + a `labelKey` in `constants.ts` | never inlined, `aria-label` and `title` included |
| a `CSSProperties` blob | that folder | `styles.ts`, as a key on `s` | the *shape* repeats in 3 folders → a `@devdigest/ui` primitive upstream, **not** a shared `styles.ts` |
| a format/derive fn, 1 caller | that folder | `helpers.ts` | a 2nd caller → `src/lib/domain/<noun>.ts` |
| a rule the server also has | 1 · `src/lib/domain/` | `<noun>.ts` + `<noun>.test.ts` | immediately, even at one caller |
| a severity/status/category map | 0 · `@devdigest/ui` (`SEV`, `CAT`) | — | already exists — use it, don't re-declare |
| a fetch | 2 · `src/lib/api.ts` | — | — |
| a `useQuery` / `useMutation` | 2 · `src/lib/hooks/<domain>.ts` | — | a new domain → new file + a line in `hooks/index.ts` |
| a query key | 2 · `src/lib/query-keys.ts` | — | — |
| React-dependent behaviour, 1 component | that folder | `hooks/use<X>.ts` | a 2nd consumer → `src/components/<x>/hooks/` if it is UI behaviour, `src/lib/hooks/` only if it does I/O |
| app-wide non-server state | 2 · `src/lib/` | `<name>.tsx` context (`theme`, `toast`, `repo-context`) | — |
| cross-cutting chrome | 3 · `src/components/app-shell/` | — | — |
| a shared TS type | 2 · `src/lib/types.ts` (re-export) or the hook that owns it | — | a contract type belongs upstream in `vendor/shared` |
| a UI primitive (Button, Select…) | **nowhere here** — `@devdigest/ui` upstream | — | never extend `src/vendor/ui/` in `client/` |
| a runtime value from `@devdigest/shared` | 2 · `src/lib/` mirror + comment | — | see `src/lib/feature-models.ts:3-12` |

## The three questions

For anything the table misses, these pick the tier every time:

1. **How many consumers?** One → colocated. Two or more → up a tier.
2. **Does the server have this rule too?** Yes → tier 1, `src/lib/domain/`, regardless
   of consumer count. Two implementations of one business rule drift, and the client's
   copy is the one that gets forgotten.
3. **Does it import React or CSS?** Yes → it is not tier 1. `src/lib/domain/` is pure
   TypeScript; a function that returns a colour or a `CSSProperties` is presentation.

If the answers put it in tier 1 but you cannot name the *rule* it encodes — no
ordering, no threshold, no server counterpart — it is a helper. Leave it colocated.

## Promotion and demotion

Promotion is mechanical: move the function, keep the doc comment, add a `*.test.ts`
if it landed in tier 1, delete the old copy, update imports to `@/lib/domain/<noun>`.

**Demotion is equally valid and rarely done.** When `src/components/<x>/` is down to
one consumer again, move it back into that route's `_components/`. Without this,
tier 3 becomes a graveyard of things that were shared once. `src/components/showcase/`
is the current example: dev-only, reachable from no route, its only consumer is
`src/test/smoke.test.tsx`.

Promotion is not triggered by the count alone. Two consumers is the *floor*; promote
when you can also name which part varies and would become a parameter. Until then,
duplication is cheaper than the wrong abstraction — see [SKILL.md](SKILL.md) "When not
to split".

## Naming

| Thing | Convention | Example |
|---|---|---|
| tier-3 folder | `kebab-case` | `src/components/run-cost-badge/` |
| tier-4 folder | `PascalCase` | `_components/FindingCard/` |
| component file | `PascalCase.tsx`, matches its folder | `FindingCard.tsx` |
| the style object | always `s` | `export const s = { … }` |
| style variant | a function on `s` | `card: (focused: boolean) => ({ … })` |
| constant | `SCREAMING_SNAKE` | `LOW_CONFIDENCE_THRESHOLD` |
| i18n key in a constant | suffix `Key` | `labelKey: "verdict.requestChanges"` |
| query hook | `use<Noun>` | `usePrRuns` |
| mutation hook | `use<Verb><Noun>` | `useCancelRun` |
| domain module | `src/lib/domain/<noun>.ts` | `domain/runs.ts` |
| props type | `<Name>Props`, exported | `export interface FindingCardProps` |

The kebab/Pascal split between tiers 3 and 4 is real, consistent, and works as a
visual tier marker in an import list. Document it; do not unify it.

## Worked example — `outcomeOf`

`RunHistory.tsx:25` holds `outcomeOf(run)`: given a run, return its outcome key,
colour, background and icon. It is 15 lines inside a 254-line component file. Where
does it belong?

**Q1 — how many consumers?** One today.

**Q2 — does the server have this rule?** Yes, and the file says so:
*"matches the CI gate (deterministic) rather than the model's verdict"*
(`RunHistory.tsx:17-20`). The mapping *blockers > 0 → rejected* is a business rule the
server also implements. That alone sends it to tier 1, one consumer or not.

**Q3 — does it import React or CSS?** Partly — it returns `color`, `bg` and an
`IconName`. So it splits:

1. `src/lib/domain/runs.ts` gets the rule as pure data:
   ```ts
   export type RunOutcome = "running" | "error" | "cancelled" | "rejected" | "reviewed" | "approved";
   /** Mirrors the CI gate in server/src/modules/pulls/routes.ts — not the model's verdict. */
   export function outcomeOf(run: RunSummary): RunOutcome { … }
   ```
   plus `src/lib/domain/runs.test.ts` covering blockers-beats-findings and the
   `cancelled` branch.
2. The presentation half — `RunOutcome` → colour/bg/icon — is a **token map**, so
   `C13` applies: it goes next to `SEV`/`CAT` in `@devdigest/ui` if outcomes are
   app-wide, or in `RunHistory/constants.ts` as `OUTCOME_META` keyed by `RunOutcome`
   while it has one consumer.
3. `outcomeOf`'s `key` is already i18n-shaped (`"rejected"`, `"approved"`) — keep it
   as a `labelKey` lookup, per `C10`.

While in that file, `tsOf` (`RunHistory.tsx:84`) is a second candidate and an easier
one: it is byte-equivalent to `severity-counts/helpers.ts:75`. Two consumers, so `C12`
promotes it — `src/lib/domain/time.ts`, both copies deleted.

## The barrel that leaks

`src/components/severity-counts/index.ts` re-exports `latestPerAgentRuns` alongside
the component. So `pulls/[number]/page.tsx:13` imports a business rule — one that
explicitly mirrors `server/src/modules/pulls/routes.ts` — from a *UI component
folder*, and a tier-4 page reaches into tier 3 for something that is tier 1.

The helper is well-written: it has a 16-line doc comment explaining the runs-vs-reviews
rule and naming its server counterpart. Nothing about it is wrong except where it
lives. `C7` and `C12` move `latestPerAgentRuns`, `severityTally` and `totalOf` to
`src/lib/domain/reviews.ts`; `severity-counts/index.ts` then exports the component and
its props type, and nothing else.
