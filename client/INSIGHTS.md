# Insights — client

Append-only log of things this package **could not have told you** — what a
failed command, a surprise, a correction, or a rejected alternative cost us. If
reading the source plus `CLAUDE.md` would have produced it, it does not belong
here. Add to the matching section, newest first within it. A learning about
`scripts/`, Docker, or CI belongs to the package whose work it blocked.

**History, not rules** — dated notes under human spot-check, not verified docs. When an
entry hardens into a rule, promote one line into `CLAUDE.md` **Gotchas** and mark the
entry `→ promoted`; the full story stays here. Trust `CLAUDE.md` over an old entry.

Written by the `engineering-insights` skill, which reads this file to avoid repeating
itself, then appends. Read it when you start work in this package.

Never rewrite, reorder, or delete an existing entry. The one permitted edit is
appending `→ promoted to CLAUDE.md` when an entry hardens into a `CLAUDE.md`
**Gotchas** bullet.

Entry form: `- YYYY-MM-DD — finding → what to do (path:line)`. Full rules —
sections, dedup, promotion, prune thresholds — live in
`.claude/skills/engineering-insights/SKILL.md`.

## What Works

<!-- approaches that worked here and are worth repeating -->

_None yet._

## What Doesn't Work

<!-- tried and abandoned, and why — the most valuable section, and the one most often skipped -->

- 2026-08-06 — `usePulls` could not be made self-quenching per the `CLAUDE.md` "polls must
  self-quench" rule, because `PrMeta` carries no in-flight signal at all: `PrStatus` is
  `needs_review|reviewed|stale|open|closed|merged`, so a `refetchInterval` predicate has
  nothing to test and a first attempt (`pr.review_status === "running"`) silently matched
  nothing and disabled the poll → drop the interval entirely and let the writers refresh
  the list: `useRefreshRepo` re-syncs, and the review/finding mutations invalidate
  `qk.repos.pulls(repoId)` for the row counters (`src/lib/hooks/core.ts:107`,
  `src/vendor/shared/contracts/platform.ts:155`)

- 2026-08-05 — `toFixed(2)` on a run cost renders `$0.00` for nearly every real run
  (a live `deepseek/deepseek-v4-flash` review cost `0.00025368`; runs sit in the
  $0.0002–$0.05 band), destroying the one signal a cost badge exists to carry → format
  with `toPrecision(3)`, not fixed decimals. This is why the `formatCost` deleted by
  `d45ab0d` could not simply be restored (`src/components/run-cost-badge/helpers.ts:19`)
- 2026-08-05 — trimming `toPrecision` output by round-tripping through Number —
  `Number(x.toPrecision(3)).toFixed(20)` — reintroduces float artifacts
  (`0.0134` → `0.01340000000000000045`) → strip zeros on the STRING and never go back
  to Number: `x.toPrecision(3).replace(/0+$/,"").replace(/\.$/,"")`
  (`src/components/run-cost-badge/helpers.ts:28`)
- 2026-08-05 — `toPrecision` switches to exponential at ≤1e-7 (`(1e-7).toPrecision(3)`
  → `"1.00e-7"`), so an unguarded formatter prints scientific notation in a table cell
  → floor sub-microdollar costs to a `<$0.000001` sentinel
  (`src/components/run-cost-badge/helpers.ts:25`)

## Codebase Patterns

<!-- conventions and architecture that are not obvious from reading the code -->

- 2026-08-06 — the rule "a mutation invalidates its own writes" has one path it cannot
  cover: a review settles over SSE, which is neither a mutation nor a query, so nothing
  in TanStack fires when a run finishes. Before this, the PR page patched it with
  `invalidateActiveRuns`/`invalidateRunHistory` closures threaded down as
  `onRunDone`/`onRunsStarted` props through `PrDetailHeader`, `FindingsTab` and
  `RunStatus` → give the SSE hook the invalidation instead: `useRunEvents(runIds, {prId,
  repoId})` invalidates when its last stream closes, which deleted the whole prop chain.
  Read the scope through a ref — a caller passing a fresh object literal each render
  would otherwise re-subscribe every EventSource (`src/lib/hooks/reviews.ts:200`,
  `src/lib/hooks/reviews.ts:239`)
- 2026-08-06 — corrects the three 2026-08-05 entries above/below that cite
  `src/components/run-cost-badge/helpers.ts`: that file no longer exists. The cost
  formatters moved to the pure domain tier and the numeric findings still hold verbatim
  there → read them at `src/lib/domain/cost.ts:23` (`formatCost`) with the regression
  tests in `src/lib/domain/cost.test.ts`; the same move sent `severityTally`/`totalOf` to
  `src/lib/domain/findings.ts` and `latestPerAgentRuns` to `src/lib/domain/reviews.ts`
- 2026-08-05 — on run/PR cost, `null` and `0` are different facts: `null` = unknown
  (unpriced model, or the run never completed) and renders `—`; `0` = real data (a free
  model such as `z-ai/glm-4.7-flash`) and renders `$0`. Collapsing them with `|| 0` or
  `?? 0` labels a failed run "free" → keep the two branches distinct in every cost
  formatter and in the server's fallbacks (`src/components/run-cost-badge/helpers.ts:20`,
  `specs/run-cost-badge.md`)

## Tool & Library Notes

<!-- version constraints and quirks of deps and the toolchain -->

_None yet._

## Recurring Errors & Fixes

<!-- Symptom / Cause / Fix blocks, newest first -->

_None yet._

## Session Notes

<!-- dated one-liners: what a session changed, and what it cost to find out -->

_None yet._

## Open Questions

<!-- unresolved, each with what would settle it -->

_None yet._
