# client-architecture — sources

Every rule in [SKILL.md](SKILL.md) traces to something here. Each entry names the
concrete rule it contributes, so a disagreement about a rule can be taken up with its
source rather than with the skill.

All URLs below were fetched and verified live when this file was written
(2026-08-06). Where a source argues *against* one of our rules, that is said out loud
in section C rather than quietly dropped.

This is the frontend twin of [onion-architecture](../onion-architecture/README.md).
Both skills describe the same repo, so where a fact is repo-wide (no ESLint, for
instance) this file points there instead of restating it.

## A. Layering and placement

**Presentation Domain Data Layering** — Martin Fowler, 2015
<https://martinfowler.com/bliki/PresentationDomainDataLayering.html>
The reason tier 1 exists at all. Fowler's primary payoff for layering is cognitive,
not architectural: it lets him "reduce the scope of my attention" so each concern is
considered "relatively independently," and he insists "the reduced scope of attention
reason is sufficient on its own" — substitutability and testability are bonuses. Two
lines shape our tier table directly. First, layering should be "applied at a
relatively small granularity"; once a layer grows too large, "split your top level
into domain oriented modules which are internally layered" — which is exactly why
`_components/` beats a global `components/` here, and why `C2` keeps new components
route-private. Second, extra layers (a service layer, a presentation model, a mapper)
don't break the pattern "since the core separations still remain" — cited for `C12`
adding a domain tier without disturbing anything above it.

**Modularizing React Applications with Established UI Patterns** — Juntao Qiu
(martinfowler.com), 2024
<https://martinfowler.com/articles/modularizing-react-apps.html>
The direct source of `C12` and the sharpest statement of this skill's premise: React
"takes no position on where calculation or business logic lives," so the
everything-in-component habit is a default, not a design. Walks the five-stage
progression single component → multiple components → hooks → business models →
layered application, and names the layers we adopt: view (pure presentational), hooks
as "a state machine behind a view," domain model with "data and behaviour centralised
into a single place," carrying "no UI-related information," strategy objects, and a
gateway/ACL. Its test for whether logic is in the right place is the one `C11`/`C12`
encode — ask how much of your non-view code would survive a switch to Vue or a CLI.
Also supplies the smells we audit for: conditionals embedded in JSX as a "logic
leak," silent conversions inside anonymous `.map` callbacks, and the *shotgun
surgery* smell where one change forces edits across views, hooks and formatters —
which is precisely the `SEVERITY_ORDER`/severity-colour situation in `C13`. Ends
anti-dogmatically ("keep small, cohesive components intact rather than scattering
behaviour across many files"), cited in "When not to split."

**Feature-Sliced Design — overview** — <https://feature-sliced.design/docs/get-started/overview>
The vocabulary behind the tier table, adopted conceptually and rejected
nominally. FSD's three-level hierarchy is layers → slices → segments, with the
governing constraint that "modules on one layer can only know about and import from
modules from the layers strictly below" — that sentence is `C1`. Its segment
definitions map 1:1 onto conventions this repo already has: `ui` is "everything
related to UI display," `model` is "the data model: schemas, interfaces, stores, and
business logic," `lib` is "library code that other modules on this slice need,"
`config` is "configuration files and feature flags," `api` is "backend interactions."
Read against `client/src`, the repo already implements FSD's slices (route segments)
and segments (`Component.tsx` / `helpers.ts` / `constants.ts` / `src/lib/hooks/`)
under different names; the only genuinely missing layer is `model`, which is why the
whole FSD adoption here costs exactly one new directory. Its rule that "slices cannot
use other slices on the same layer" is the second half of `C1` — no lateral reach
between route subtrees. We deliberately do **not** take the directory names
(`features/`/`entities/`/`shared/`): renaming would move ~150 files, invalidate every
`path:line` in `client/CLAUDE.md` and `docs/architecture.md`, and forfeit App
Router's free `_folder` privacy — all to buy a property the repo already holds.

**bulletproof-react — project structure** —
<https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md>
Source of the unidirectional-flow rule in its most quotable form: shared → features →
app, where "shared code is importable anywhere; features may only reach into shared
code," which makes the codebase "more predictable and easier to understand." Also the
no-cross-feature-imports rule ("each feature stays independent which makes the
codebase less convoluted"), cited for `C1`/`C2`. Its enforcement mechanism is
`import/no-restricted-paths` with `zones` — the concrete recipe named in
[migration.md](migration.md) as the first thing to mechanise if this repo ever adopts
ESLint. Note that this source also **dropped barrel files** (they "hinder Vite's tree
shaking"); see section C, where that disagreement is settled rather than hidden.

**Project structure and organization** — Next.js official docs
<https://nextjs.org/docs/app/getting-started/project-structure>
The authority for `C2` and `C4`'s use of `_components/`. Next is explicitly
"unopinionated about how you organize and colocate your project files," and gives two
guarantees we lean on: a route "is **not** publicly accessible until a `page.js` or
`route.js` file is added," so "**project files** can be **safely colocated** inside
route segments in the `app` directory without accidentally being routable"; and an
underscore prefix "indicates the folder is a private implementation detail," which
"opt[s] the folder and all its subfolders out of routing." The docs list the benefits
we actually get from `_components/`: "separating UI logic from routing logic,"
consistent organization "across a project and the Next.js ecosystem," editor grouping,
and "avoiding potential naming conflicts with future Next.js file conventions." Of the
three named strategies, this repo uses "split project files by feature or route," and
the docs' own closing advice is the one `SKILL.md` inherits: "choose a strategy that
works for you and your team and be consistent across the project."

**React Folder Structure in 5 Steps** — Robin Wieruch, 2024
<https://www.robinwieruch.de/react-folder-structure/>
Source of the promotion rule in `C2`/`C12`, stated as a heuristic rather than a
threshold: if exactly one feature uses a util/hook/component it lives in that feature;
once two or more need it, it moves up to the shared top-level folder — "and it can be
demoted back down." That last clause is why [placement.md](placement.md) has a
demotion section, without which `src/components/` becomes a graveyard. Also supplies
`C4`'s "scale horizontally inside the folder" model (`types.ts`, `hooks.ts`,
`utils.ts`, `constants.ts` as siblings), the two-levels-of-nesting rule of thumb, the
observation that a hook used by one component "should remain in the component's file
or a `hooks.js` file next to the component," and a boundary test worth running
occasionally: imagine deleting one feature folder and count what breaks. Independently
notes that barrels "are getting out of fashion" — see section C.

## B. Data access, keys, and state

**Effective React Query Keys** — TkDodo, 2021
<https://tkdodo.eu/blog/effective-react-query-keys>
Source of `C15` and the whole of [query-keys.md](query-keys.md). Three claims we
take: keys belong beside their queries rather than in a global `queryKeys.ts` ("I
don't believe that storing all your Query Keys globally in `/src/utils/queryKeys.ts`
will make things better"); structure them "from _most generic_ to _most specific_" so
fuzzy matching gives you a whole feature, a subset, or one entry; and hand-written
literals are "not only error-prone, but it also makes changes harder in the future"
— particularly when you later insert a granularity level and every literal needs
updating. Which is the situation at `pulls/[number]/page.tsx:53,58` today. The
prescribed fix is "one Query Key factory per feature," a plain object whose entries
each build on the last "but is still independently accessible." Note our one
deliberate divergence: this repo's hooks are grouped by domain in `src/lib/hooks/*`
rather than per-feature-folder, so the factory lives at `src/lib/query-keys.ts`
next to them — colocated with the queries in this repo's layout, which is the spirit
of the rule. Also the source of "queries are declarative": don't pass parameters to
`refetch`, put changing state in the key.

**Query Invalidation** — TanStack Query docs
<https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation>
The mechanism that makes a nested factory pay off, and the reason `query-keys.ts`
nests under `pr`/`repo` roots. Query keys are matched as a *prefix* by default, so
`['todos']` invalidates `['todos', { page: 1 }]` and `['todos', 'list']` alike; adding
segments narrows the match and does **not** hit the shorter parent; `exact: true`
restricts to the key as written; and `predicate` handles anything else. Invalidation
does two things — flags the query stale, "overriding any `staleTime` configurations,"
and background-refetches it if currently rendered. This is what lets one
`qk.pr(prId)` call replace the four hand-written invalidations in the matrix.

**Reusing Logic with Custom Hooks** — react.dev
<https://react.dev/learn/reusing-logic-with-custom-hooks>
The authority for `C11`'s React-free `helpers.ts` and `C14`'s hook naming. The
deep-dive answers the exact question the placement table asks: "Functions that don't
*call* Hooks don't need to *be* Hooks. If your function doesn't call any Hooks, avoid
the `use` prefix" — a plain `getSorted` over a pointless `useSorted`, with the
practical payoff that non-hooks can be called conditionally. The naming convention is
load-bearing for auditing, not cosmetic: it "guarantees that you can always look at a
component and know where its state, Effects, and other React features might 'hide'."
Also cited in "When not to split": "You don't need to extract a custom Hook for every
little duplicated bit of code. **Some duplication is fine**," and "if you struggle to
pick a clear name, it might mean that your Effect is too coupled to the rest of your
component's logic, and is not yet ready to be extracted." Its warning against
over-abstract hooks ("if your custom Hook API doesn't constrain the use cases and is
very abstract, in the long run it's likely to introduce more problems than it
solves") is the hook-shaped version of the Wrong Abstraction.

**You Might Not Need an Effect** — react.dev
<https://react.dev/learn/you-might-not-need-an-effect>
Cited for one placement consequence only, since `react-best-practices` owns the React
semantics: the fix for a chain of computations is to "calculate what you can during
rendering" — which is what makes derivations *movable* into `helpers.ts` or
`src/lib/domain/` in the first place. A value computed in an Effect is stuck in the
component; a value derived from props is a pure function waiting to be extracted. The
distinction we reuse in `C3` when thinning a page is its rule of thumb — Effects are
"only for code that should run *because* the component was displayed to the user."

**Choosing the State Structure** — react.dev
<https://react.dev/learn/choosing-the-state-structure>
Cited for `C13`. "Avoid duplication in state" — store an ID, not a copy of the object
— is the same failure mode one tier up: a re-declared severity map is duplicated
*constants* rather than duplicated state, and it decays identically, one copy silently
drifting from the other. The docs' framing that the goal is "to make state easy to
update without introducing mistakes," by analogy with database normalization, is the
argument for declaring a token map exactly once.

**Server Components** — react.dev
<https://react.dev/reference/rsc/server-components>
Listed to mark a deliberate scope boundary, not to found a rule. This repo is 62
`"use client"` files against 3 real server components, which is a *decision*
(`client/CLAUDE.md`: "The server is the source of truth; the client only caches it")
rather than drift — and revisiting it is `next-best-practices`' territory. The page
does supply the composition direction if that ever changes: a Server Component
imports and renders a Client Component, which receives already-rendered server output
as `children`, and server-only modules stay out of the bundle entirely.

## C. Colocation and barrels — the contested part

Two of the sources below argue against a rule this skill keeps. Recording the
disagreement is the point; a reader who disagrees should be able to find the argument
rather than discover it later.

**Colocation** — Kent C. Dodds, 2019 <https://kentcdodds.com/blog/colocation>
The principle behind `C4`: "Place code as close to where it's relevant as possible,"
or in the variant he credits to Dan Abramov, "things that change together should be
located as close as reasonable." Three named benefits, all of which the segment layout
buys: maintainability (separated files drift apart — you move something and forget the
mirror), applicability (people editing the code never see the distant file, so they
skip updating it), and ease of use (less context switching, and you can tell when
you've gathered everything needed to maintain a component). Crucially for `C12`, this
source treats *premature* extraction into a shared `utils/` as the failure mode, not
the goal: a helper extracted in anticipation outlives the component it was pulled
from, and gets maintained for years — "wasted effort and cognitive load." Shared
locations are justified "by actual span of relevance, not anticipated reuse," which is
the promotion rule's real justification. Also the argument for colocating tests, which
is why `C4` lists `*.test.tsx` as a segment.

**Please stop using barrel files** — TkDodo, 2024
<https://tkdodo.eu/blog/please-stop-using-barrel-files>
Cited **against** `C5`, and the reason `C6` and `C7` exist. Three concrete harms:
accidental circular imports, since a file inside the directory importing a sibling
*through* the barrel creates a cycle, and "I have seen bundlers crash with the
weirdest of error messages because of it" — worse because editors auto-generate these
imports, so it happens by accident; dev-server module bloat, because importing one
symbol makes JS "traverse the `index.ts` file and load every module inside of it,
synchronously," measured at 11k modules and 5–10s page start-up reduced to ~3.5k, "a
reduction of 68%"; and the escape hatch is fragile — Next's `optimizePackageImports`
only applies to a barrel containing nothing but re-exports, so one `export const foo =
5` defeats it. He concludes a barrel makes sense only as a package's public entry
point, and explicitly rejects "using barrels to group directories in product code."
**How we reconcile it:** the cycle class is the one that actually bites here, and `C6`
removes it by rule — inside a folder, import siblings directly, never `from "."`. The
module-count harm scales with barrel depth and third-party re-exports; this is a
47-folder app whose barrels re-export one component each, not a design system, and
`C7` forbids the case that makes them fat (a barrel dragging domain logic along).
Against that we weigh what `C5` buys: an enforceable folder boundary, which is the
mechanism behind zero cross-route leaks in `_components/` today — a property this repo
measurably has and should not spend. If the dev server ever gets slow, this entry is
where to start, and `C7` is the first thing to check. Also worth taking regardless of
the barrel question: his framing that consistency beats taste — pick conventions and
"statically enforce as much as possible to avoid bike-shedding discussions."

## D. Critiques — why "When not to split" exists

A skill that cited only sections A and B would be a cargo cult.

**The Wrong Abstraction** — Sandi Metz, 2016
<https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction>
The maxim: "duplication is far cheaper than the wrong abstraction." Her decay arc is
the exact risk `C12`'s promotion rule runs — someone extracts shared code, a new
requirement *nearly* fits, a second developer adds a parameter and a conditional
rather than disturbing the structure, and it repeats until what was one coherent idea
becomes "a condition-laden procedure which interleaves a number of vaguely associated
ideas." The diagnostic is concrete and worth auditing for: parameters and conditional
branches accumulating in shared code mean the abstraction is wrong. She names the
reason people won't undo it — the sunk cost fallacy, made worse because difficulty
reads as evidence of importance — and prescribes re-inlining: push the code back to
each call site, keep only the branches that caller exercises, then look for real
duplication again. "The fastest way forward is back." This is the source for the
`LOG_HEIGHT` counter-example in "When not to split": two constants with the same name
and different meanings are not duplication, and merging them is this failure exactly.

**AHA Programming** — Kent C. Dodds, 2020 <https://kentcdodds.com/blog/aha-programming>
"Avoid Hasty Abstractions," positioned as the middle path between dogmatic DRY and
WET. Supplies the *timing* half of `C12`: tolerate repeated code until you understand
which parts vary and would make sensible parameters, because "optimize for change
first" — nobody can predict what a codebase will need. The costs of abstracting early
are the ones the promotion rule is designed to avoid: you bend new cases to fit the
existing abstraction instead of reconsidering it, and it accretes conditionals "until
it effectively becomes the whole application." Kept honest by the opposing cost he
also reports — fixing one bug in eight copy-pasted locations — which is why the rule
promotes at two consumers rather than never.

**Container/Presentational Pattern** — patterns.dev
<https://www.patterns.dev/react/presentational-container-pattern/>
Cited as **superseded**, so nobody reintroduces it as an architectural layer. The
separation it sells is real, but the mechanism is obsolete: "Hooks make it possible to
achieve the same result without having to use the Container/Presentational pattern,"
and modern React "strongly favors **Hooks over container components**" — custom hooks
"can replace class-based containers entirely," with "less boilerplate and no wrapper
component." It also warns the pattern "can easily be an overkill in smaller sized
application." Relevant because a wrapper whose only job is to call a hook and pass
props down is a tier-4 component that earns nothing — `C3` thins pages by moving
wiring into a colocated hook, not by adding a container.

## E. Boundary-enforcement tooling

`client/` has **no ESLint at all** — the scripts are `dev`, `build`, `start`,
`typecheck`, `test`. So every rule here is a review checklist, not a lint rule. See
[migration.md](migration.md) for that decision and its rationale.

The option inventory lives in
[onion-architecture/README.md § Boundary-enforcement tooling](../onion-architecture/README.md)
— `eslint-plugin-boundaries`, core `no-restricted-imports`, `dependency-cruiser`. Same
repo, same absent-ESLint fact, one place to maintain. Two frontend-specific deltas:
the vehicle would be `eslint-config-next` (`next lint` is not currently wired up
either), and the rule bulletproof-react actually uses for this job is
`import/no-restricted-paths` with `zones`, which maps onto `C1` more directly than
`no-restricted-imports` patterns do. `import/no-cycle` is the one that would catch
`C6` violations mechanically.

## F. In-repo authorities

The rules about *this* repo trace to files, not blog posts. These win on any conflict
with anything above.

- `client/CLAUDE.md` — **authoritative.** Source of the segment list in `C4`, the
  `src/lib/api.ts` and `src/lib/hooks/*` rules in `C14`, and the self-quenching poll
  rule `C16` cites rather than restates.
- `client/INSIGHTS.md` — dated history, not rules; `CLAUDE.md` wins on conflict. Its
  run-cost entries are why `src/lib/domain/` modules carry tests: `null` (unknown) and
  `0` (a real free model) are different facts, and collapsing them with `?? 0` labels a
  failed run "free."
- `CLAUDE.md` (root) — the four-package layout, and the warning that
  `client/src/vendor/shared/` is a hand-synced copy of the server's Zod contracts that
  has already drifted, which TypeScript will not flag.
- `docs/architecture.md` — end-to-end data flow and the DB model.
- `src/vendor/ui/primitives/tokens.ts` — `SEV` and `CAT`, the canonical token maps
  `C13` points at.
- `src/lib/feature-models.ts` — the reference for the types-only vendor rule, with a
  comment explaining *why* a runtime value must be mirrored rather than imported
  (webpack resolution).
- `specs/findings-by-severity.md`, `specs/run-cost-badge.md` — the two implemented
  lesson specs whose rules `src/lib/domain/` would host.

## Changelog

### 1.0.0 — 2026-08-06

Initial skill. Five-tier table mapped to real paths, rules `C1`–`C16`, placement and
promotion tables, the mandated query-key factory with an invalidation matrix, a
"when not to split" section, and audit mode. Deliberately scoped: rules, placement
guidance and an audit workflow only — no lint config, no CI step, and no exhaustive
inventory of existing violations. FSD is adopted conceptually; its directory names are
not. Barrels are kept, narrowed by `C6`/`C7`, over the objection of two cited sources
(§C).
