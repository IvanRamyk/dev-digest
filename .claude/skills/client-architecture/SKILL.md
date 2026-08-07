---
name: client-architecture
description: Prescribes the target architecture for this repo's client/ package — five tiers (vendor · domain · access · shared UI · route) with downward-only imports, one component per folder with index/styles/constants/helpers segments, a mandatory query-key factory, and a thin pure domain layer at src/lib/domain/. Use when adding or moving a component, page, hook, constant, style object, helper, type, or query key in client/; when deciding whether something is route-private or shared; when a page.tsx grows past composition; when a query key or invalidateQueries call is written by hand; when a constant or token map looks duplicated; and when the user asks to audit or review frontend structure, placement, or layering. It does not cover React semantics such as effects, memoization or keys (use react-best-practices), Server/Client boundaries and Next file conventions (use next-best-practices), or component testing (use react-testing-library).
version: 1.0.0
user-invocable: true
---

# Client architecture — five tiers for the Next.js studio

Applies to `client/` only. The rules restate and sharpen `client/CLAUDE.md`
**Conventions** and **Gotchas** — that file is authoritative and wins on any
conflict. Sources for every rule: [README.md](README.md).

Companion files: [placement.md](placement.md) — where does X go ·
[query-keys.md](query-keys.md) — the key factory and invalidation matrix ·
[examples.md](examples.md) — bad→good pairs from this repo ·
[migration.md](migration.md) — where target ≠ current, and in what order.

## Sibling skills

- React semantics — hooks rules, memoization, keys, a11y technique →
  `react-best-practices`
- Server/Client boundaries, `"use client"`, file conventions, metadata, bundling →
  `next-best-practices`
- Writing the `*.test.tsx` that `C4` requires → `react-testing-library`
- Backend layering, this skill's mirror → `onion-architecture`

## Where this skill overrides `react-best-practices`

That catalog assumes a Vite + Tailwind + axios + react-router stack, so seven of its
rules do not hold here. They now carry in-place warnings in that file; this skill wins
on all seven.

- *"Use utility classes for all styling — no inline `style={}` objects"* →
  **superseded.** Tailwind 4 is installed but only powers the vendored design-system
  CSS; app code uses no utility classes. Styling is a `styles.ts` exporting one
  `CSSProperties` object named `s`. See `C9`.
- *"Prefer the project's `components/ui/`"* → **wrong path.** The design system is
  vendored at `src/vendor/ui/` (`@devdigest/ui`) and is **consume-only** — never extend
  it in `client/`; fix the upstream.
- *"Use the project's `useApiQuery`/`useApiMutation` core hooks"* → **no such hooks
  exist.** The primitives are `api` from `src/lib/api.ts` plus TanStack
  `useQuery`/`useMutation` inside `src/lib/hooks/`. See `C14`.
- *"Shared utilities go in `utils/`"* → there is no `src/utils/`. Shared code is
  `src/lib/`, and business rules are `src/lib/domain/`. See `C12`.
- *Axios + React Patterns* (whole section) → `axios` is not a dependency; `src/lib/api.ts`
  wraps `fetch`, and cancellation/retry/dedup are TanStack's. See `C14`.
- *Error boundaries via `react-error-boundary` + `resetKeys={[location.pathname]}`* →
  not a dependency, and that is a react-router idiom. App Router uses `error.tsx` /
  `global-error.tsx` → `next-best-practices`.
- *Vite `manualChunks` and `React.lazy` route splitting* → Next does not build with Vite
  (vitest only), and the App Router code-splits per route already.

One further correction, independent of the stack: that skill's *"container components
fetch data"* is superseded by hooks — a wrapper whose only job is to call a hook and
pass props down earns nothing. Thin a page with a colocated hook, not a container
(`C3`, and [README.md](README.md) §D).

## The tiers

Five tiers, mapped to real paths — "the domain layer" here means a directory you can
`cd` into.

| Tier | Lives in | May import |
|---|---|---|
| 0 · vendor | `src/vendor/shared/` (types) · `src/vendor/ui/` (`@devdigest/ui`) | nothing in `src/` — consume only, never extend here |
| 1 · domain | `src/lib/domain/*.ts` **(new)** | tier-0 types, `zod`. **Zero React, zero CSS, zero fetch.** |
| 2 · access | `src/lib/api.ts` · `src/lib/query-keys.ts` **(new)** · `src/lib/hooks/*` · `src/lib/{types,theme,toast,repo-context,providers}` | tiers 0–1 |
| 3 · shared UI | `src/components/<kebab-case>/` | tiers 0–2; other tier-3 folders **through their barrel only** |
| 4 · route | `src/app/**` — `page.tsx`, `layout.tsx`, `_components/**` | tiers 0–3, and its own subtree |

**Imports point downward, always.** A tier never imports a tier above it. Today
`src/components/**` and `src/lib/**` hold zero references to `src/app/**` — that
invariant already holds, and it is cheap to keep.

**No lateral reach.** A route imports its own subtree or tiers 0–3 — never a sibling
route's `_components/`. Skipping a tier downward is fine: a `page.tsx` may use
`src/lib/domain/` directly without inventing a passthrough component. Reaching up or
sideways never is.

This repo already implements Feature-Sliced Design's slices (route segments) and
segments (`Component.tsx` / `helpers.ts` / `constants.ts` / `src/lib/hooks/`) under
different names. The one missing layer is the domain model — hence tier 1, one new
directory, zero renames.

## Hard rules

Cited by id in audit findings.

**C1 — imports point downward only.** The tier table is the whole rule. No tier
imports a tier above it; no route imports another route's `_components/`.

**C2 — route-private is the default.** A new component goes in the `_components/` of
the route that uses it. It moves to `src/components/<kebab-case>/` when a **second
route** consumes it — never in anticipation of reuse.

**C3 — `page.tsx` is a composition root.** Route params, hook wiring, one view
component, and the loading/error/not-found triage. No business rule, no
`invalidateQueries`, no layout beyond the shell. Target ≤ 60 lines; today
`repos/[repoId]/pulls/[number]/page.tsx` is 195.

**C4 — one component = one folder.** `Component.tsx` · `index.ts` · `styles.ts` ·
`constants.ts` · `helpers.ts` · `Component.test.tsx`. A segment that would be empty
is **omitted, not stubbed**. A child component gets its own `_components/` inside the
parent folder — already the pattern in `AgentEditor/`, `RunTraceDrawer/`,
`SettingsView/`.

**C5 — `index.ts` is the folder's public API.** Outside callers import the folder.
They never reach past the barrel into `./styles`, `./helpers`, or `./Component`.

**C6 — inside a folder, import siblings directly.** `import { s } from "./styles"` —
never `from "."` or `from "./index"`. A self-referential barrel is a cycle, and
neither `tsc --noEmit` nor the Next dev server reports it in terms you can act on.

**C7 — a barrel exports the component, its props type, and nothing else.** No domain
logic, no shared helpers. `severity-counts/index.ts` re-exporting `latestPerAgentRuns`
is why a *page* imports a business rule from a *UI component folder*.

**C8 — `@/` leaves the folder, relative stays inside.** Anything crossing out of the
current component or route subtree uses `@/…`; siblings and children stay relative.
Seven levels of `../` — `"../../../../../../../lib/hooks"` at `SettingsApiKeys.tsx:6`
and `ReviewRunAccordion.tsx:13` — is not a style preference; it is unreviewable, and it
breaks silently when a folder moves.

**C9 — `styles.ts` exports exactly one object, `s`.** Values are `CSSProperties`, or
functions returning it for variants: `card: (focused: boolean) => CSSProperties`.
Colours are always `var(--token)`, never a hex literal — that is what makes the theme
toggle work. Zero `style={{ … }}` literals in new `.tsx`.

**C10 — `constants.ts` holds literals and `labelKey`s, never a user-visible string.**
Every visible string goes through `useTranslations` and
`messages/en/<namespace>.json` — including `aria-label`, `title`, and the bodies of
error and empty states, which are this repo's systematic i18n gap.

**C11 — `helpers.ts` is pure and presentation-shaped.** No React import except types,
no `next/*`, no fetch. Single-consumer by definition — see `C12`.

**C12 — the promotion rule.** One consumer → it stays in the colocated `helpers.ts`.
**Two consumers, or it mirrors a server-side rule → `src/lib/domain/<noun>.ts`**, with
zero React, zero CSS, and its own `*.test.ts`. A rule that mirrors the server names
the server file in its doc comment — `latestPerAgentRuns` already does this correctly;
it just lives in the wrong tier. Demotion is equally valid: back down to
`_components/` when only one consumer is left.

**C13 — a token map is declared once.** Severity, category, status, size and outcome
maps live in `@devdigest/ui` (`SEV`, `CAT` in `src/vendor/ui/primitives/tokens.ts`) or
in one `src/lib/domain/` module. Re-declaring one is how `SUGGESTION` became
`var(--accent)` in the trace drawer and `var(--sugg)` everywhere else — a rendering
bug that typechecks perfectly.

**C14 — one network path, one hook home.** All fetch through `src/lib/api.ts`; every
`useQuery`/`useMutation` in `src/lib/hooks/<domain>.ts`, named `use<Noun>` or
`use<Verb><Noun>`. A `useQuery` outside `src/lib/hooks/` is a finding.

**C15 — keys come from the factory; a mutation invalidates what it touches.** No key
literal outside `src/lib/query-keys.ts`. Components never call `invalidateQueries` —
the mutation hook does, for every cache entry its write affects. →
[query-keys.md](query-keys.md).

**C16 — a poll self-quenches.** `refetchInterval` is a function returning `false` when
nothing is in flight. This restates `client/CLAUDE.md` **Gotchas**, which is the
authority; the placement consequence is that the predicate belongs in the hook, not in
a caller's `useEffect`. `usePulls` (`core.ts:109`) is the standing violation.

**Vendor is types-and-consume-only.** `src/vendor/shared/` is imported for **types
only**; `src/vendor/ui/` is consumed as-is. A *runtime value* needed from
`@devdigest/shared` gets mirrored into `src/lib/` with a comment naming the upstream —
`src/lib/feature-models.ts:3-12` is the reference and the reason (importing the value
breaks webpack resolution). Note `client/src/vendor/shared/` is a hand-synced copy of
the server's contracts that has **already drifted**, and TypeScript will not flag it;
fix `server/src/vendor/shared/` first, then re-sync.

## When not to split

Structure that is not paying for itself is the failure mode this section prevents.

- **Same name is not the same concept.** `LOG_HEIGHT` is `420` in
  `RunTraceDrawer/constants.ts:7` and `200` in `RunStatus/constants.ts:4`. Two
  meanings, correctly not shared. A dedup pass that merges them is the Wrong
  Abstraction arriving on schedule.
- **Two consumers is the floor, not a trigger.** Until you can name which part varies
  and would become a parameter, duplication is cheaper. Promote when the shape is
  known, not when the count hits two.
- **Some duplication is fine.** A four-line formatter in two files is not a domain
  module waiting to happen.
- **A folder for a nine-line leaf is a tax.** `C4` scales with the component; a
  presentational leaf with no state and no constants is `Component.tsx` + `index.ts`.
- **Don't add a wrapper whose only job is to call a hook.** Thin a page by moving
  wiring into a colocated hook, not by inserting a container component.
- **`src/lib/domain/` is for rules, not for a `utils` drawer.** If it has no rule in
  it — no ordering, no threshold, no server counterpart — it is a helper, and helpers
  stay colocated.
- **If the structure is slowing the work down, say so** rather than routing around it.

## Audit mode

1. **Read the authoritative rules** — `client/CLAUDE.md` **Conventions** and
   **Gotchas**. If that file is missing, stop and report; do not audit from this file
   alone.
2. **Scope.** Branch mode: `git diff main...HEAD --name-only` (or
   `git diff --name-only HEAD` for uncommitted work). Folder mode: the named
   directory, current state.
3. **Classify** each file into a tier by path, using the table above.
4. **Check C1–C16.** In branch mode, check **changed lines only** — a pre-existing
   violation in an untouched line is out of scope and is not a finding. 40 of 46
   component folders predate these rules; see [migration.md](migration.md).
5. **Report** one block per finding, most severe first:

   ```
   [C15] keys come from the factory
   File:  client/src/app/repos/[repoId]/pulls/[number]/page.tsx:53
   Issue: hand-writes ["pr-active-runs", prId], a key owned by usePrActiveRuns
   Fix:   invalidate inside useCancelRun via qk.pr(prId).activeRuns; drop the closure
   Why:   client/CLAUDE.md — "every data hook lives in src/lib/hooks/*"
   ```

6. **A clean diff gets one line saying so.** Zero findings is a correct outcome — do
   not manufacture a finding to look thorough.

Useful checks:

```bash
rg 'from "[^"]*app/' client/src/components client/src/lib   # C1 — must be empty
rg 'queryKey: \[' client/src/app client/src/components      # C15 — must be empty
rg 'invalidateQueries' client/src/app client/src/components # C15 — must be empty
rg 'style=\{\{' client/src/app client/src/components        # C9
rg 'from "(\.\./){3,}' client/src                           # C8
rg 'from "\.";?$' client/src                                # C6 — self-referential barrel
rg 'aria-label="|title="' client/src/app client/src/components  # C10
```

How to re-derive the compliance counts: [migration.md](migration.md).

## Never

- Import a tier above you, or another route's `_components/`.
- Write a query key literal, or call `invalidateQueries`, outside `src/lib/hooks/`.
- Re-declare a severity, category, or status map that `@devdigest/ui` already owns.
- Put a user-visible string — including `aria-label` and `title` — in a `.tsx` or a
  `constants.ts`.
- Extend `src/vendor/ui/` or `src/vendor/shared/` in `client/`; fix the upstream.
- Import a folder's internals past its `index.ts`, or import your own `index.ts` from
  inside the folder.
- Refactor a non-compliant folder you were not otherwise touching.
- Report a pre-existing violation as a finding of the diff under audit.
