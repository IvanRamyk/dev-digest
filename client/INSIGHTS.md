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
