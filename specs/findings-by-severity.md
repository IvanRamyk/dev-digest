# Findings by Severity

Say how bad a PR is in three numbers, in the three places a reviewer already looks —
and let one click show only that kind.

## Context

Every finding already carries a severity. The engine assigns it, the DB stores it
(`server/src/db/schema/reviews.ts:36`), and the review score is computed from it
(`reviewer-core/src/review/reduce.ts:13`). But no surface answers "how bad is this PR"
at a glance: the PR list shows a single score ring and nothing else about what was
found (`client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:50-56`), and
the detail page shows one flat, unsegmented list per run
(`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:56-73`).
A reviewer facing 12 findings has no way to say "just show me the blockers".

Almost everything needed already exists and is unused:

- `rollupSeverities` (`server/src/modules/pulls/status.ts:23-31`) tallies the three
  buckets. It is dead code with passing tests (`server/test/pulls-status.test.ts:52-66`)
  — nothing in `src/` imports it.
- `Chip` (`client/src/vendor/ui/primitives/Chip.tsx`) is already a real `<button>` with
  `active`, `icon`, and a trailing `count`, used by the list's status filters
  (`client/src/app/repos/[repoId]/pulls/_components/FilterBar/FilterBar.tsx:41`).
- `SEV` (`client/src/vendor/ui/primitives/tokens.ts:6-14`) is the canonical
  severity → colour/icon/label map.

Commit `587c46a` shipped a `FINDINGS` column on the list and `e07efea` removed it,
taking the `PrMeta` fields with it. This restores the column, adds the hover card that
the design calls for, and turns the per-run counters into a filter.

Scope is deliberately narrow: **count findings by severity, and filter by one of them.**
Deduplicating identical findings across re-runs, multi-select filtering, category and
confidence facets, and server-side filtering are all out.

## Decision

### The count is each agent's latest run, not every review ever

Reviewing a PR with three agents writes three `reviews` rows, and re-running one agent
writes a fourth. A count that sums all of them grows monotonically with every
experiment and never matches what the reviewer is looking at.

So the rule matches `cost_usd` (`specs/run-cost-badge.md:85-100`): **re-running one
agent supersedes its own earlier review rather than adding to the total.** Rows come
back newest-first and the first `(pr_id, agent_id)` pair seen wins
(`server/src/modules/pulls/routes.ts`).

A deleted agent leaves `agent_id` NULL — `reviews.agentId` has no FK at all
(`server/src/db/schema/reviews.ts:17`) — so orphaned reviews are indistinguishable
from each other and collapse into a single bucket. That undercounts a batch whose
agents were all deleted and never double-counts one agent's retries: the safer
direction of the two, and the same trade-off cost already makes.

This scope also governs the detail page, which derives its numbers from
`allFindings` (`client/src/app/repos/[repoId]/pulls/[number]/page.tsx:72-76`). That
`useMemo` runs through `latestPerAgentRuns`, so the "Agent runs" tab badge
(`_components/PrDetailHeader/PrDetailHeader.tsx:113`) and the Lethal-Trifecta banner
input move to the same scope for free.

**The consequence is deliberate and must not be "fixed":** the tab badge no longer
equals the sum of the `{n} findings` labels on the run accordions
(`_components/ReviewRunAccordion/ReviewRunAccordion.tsx:88-91`), because the accordion
list still renders *every* review — run history does not disappear just because a run
was superseded. The badge answers "what does this PR have wrong with it"; an accordion
header answers "what did this run find". The same asymmetry already exists in the COST
column.

### A superseded run's findings are never resurrected

The aggregate is keyed on **`agent_runs`**, joined out to `reviews` and `findings` —
not on `reviews` directly. That is what makes a dead newest run silence its own
predecessor.

`insertReview` sits on the success path only
(`server/src/modules/reviews/run-executor.ts:220`, inside the `try`), so a failed,
cancelled, or still-running run writes **no `reviews` row at all**. A reviews-keyed
query therefore cannot distinguish "this agent was re-run and it died" from "this
agent was never re-run": it silently falls through to the previous successful review
and reports findings for a run that no longer exists. Keying on runs lets the failed
row win the `(pr_id, agent_id)` slot and contribute nothing.

A `running` run behaves the same way as a failed one — no result yet, so the agent
contributes nothing until it settles. Mid-review the column goes quiet rather than
asserting a stale picture. This was found by testing on real data, after the first
implementation shipped the reviews-keyed version.

**Reviews with `run_id IS NULL` are exempt and always count.** Two kinds exist: the
seeded demo review (`server/src/db/seed.ts:136-148`, which has no `agent_runs` row at
all) and any review whose run row was deleted. Neither has a newer run by "its" agent
that could supersede it, so superseding does not apply. Without this exemption the
seeded PR would report `{0,0,0}` and its visible findings would vanish — the seed's
two findings belong to exactly such a review, while every real run against it found
nothing.

### `null` is not `{0,0,0}`

Two states that must never be conflated:

| Value | Meaning | Renders |
|---|---|---|
| `null` | never reviewed — no surviving `reviews` row for this PR, **runs alone do not count** | `—` |
| `{CRITICAL:0, WARNING:0, SUGGESTION:0}` | reviewed, and clean | a check, never `—` |

A clean PR must not look like an unreviewed one — that is the whole signal. The
deleted `587c46a` implementation rendered `—` for both; this fixes it.

The distinction is carried by a LEFT JOIN from `reviews` to `findings`, so a review
with zero findings still yields one row (with a null severity) and still creates the
PR's map entry. Presence of the entry is what makes the value non-null.

**The entry is created by a REVIEW, never by a run.** Once the aggregate is keyed on
`agent_runs` (below), the obvious reading — "this PR has runs, so it has been
reviewed" — is wrong: a failed, cancelled, or still-running run writes no `reviews`
row, so a PR whose every current run produced nothing has never been reviewed and must
read `—`. Gating the map entry on a run instead of its review reported `{0,0,0}`, i.e.
a green "clean" check, for a PR whose only run had crashed — while `score` and
`cost_usd` on the same row correctly read `null`. Fixed 2026-08-06 by gating on
`reviews.id != null` (`server/src/modules/pulls/routes.ts`).

### Unknown severities are ignored, never bucketed

`findings.severity` is free-form `text NOT NULL` with no pg enum and no CHECK
constraint (`server/src/db/schema/reviews.ts:36`), and the read path casts it blindly
(`server/src/modules/reviews/helpers.ts:37`). A model that emits `"HIGH"` writes
`"HIGH"`.

So the tally goes through `rollupSeverities` (`server/src/modules/pulls/status.ts:23-31`),
which matches the three known values and silently drops anything else — not through a
SQL `GROUP BY severity`, which would quietly invent a fourth bucket that no contract,
colour map, or UI knows how to render. This revives already-tested code instead of
duplicating the rule in SQL where it cannot be unit-tested.

The client mirrors the same rule in `severityTally`
(`client/src/components/severity-counts/helpers.ts`) so both ends agree about garbage.

### Counts are derived on read, never denormalized

One extra `IN` query on the list endpoint, beside the two it already runs for score
and cost (`server/src/modules/pulls/routes.ts:118`, `:143`). The list is small and all
three are cheap.

No `findings_critical` / `findings_warning` columns on `pull_requests`. Accepting,
dismissing, or deleting a finding — or deleting a whole review
(`server/src/modules/reviews/routes.ts:135`, which cascades) — would each need a
denormalized write into a table that does not own the data, and any missed path
silently rots the number.

### The list ships counts; the popover fetches findings on hover

`PrMeta` gains three numbers and nothing more. The findings themselves are not in the
list payload and should not be: a list of 30 PRs would carry every rationale on every
row for a card the reviewer may never open.

Instead the hover card lazily calls the endpoint that already exists,
`GET /pulls/:id/reviews` (`server/src/modules/reviews/routes.ts:129`), through
`usePrReviews` with the same query key `["reviews", prId]`
(`client/src/lib/hooks/reviews.ts:51-57`). Hovering therefore *warms the cache* for
the detail page the reviewer is about to open — the fetch is not wasted work.

### The filter is per-run and local; it never hides a run

The counters that filter live in the toolbar of each run's `FindingsPanel`, next to
the `Hide low confidence` toggle it already has, and they count and filter **that run's
own findings**. Their numbers therefore reconcile with the `{n} findings` in the header
of the same accordion.

State is local React state, not a URL param. A PR has many accordions and each filters
independently; a single `?severity=` cannot express that, and forcing one filter across
all runs would make the numbers in each toolbar disagree with what that toolbar filters.
This is the one place the feature deliberately diverges from the `?tab` / `?trace`
precedent (`client/src/app/repos/[repoId]/pulls/[number]/page.tsx:62-67`).

Selection is a single-select toggle — clicking the active severity clears it — matching
`Chip`'s single `active` boolean and the list's status-filter precedent.

The filter composes with `hideLow` as an AND inside `visibleFindings`
(`_components/FindingsPanel/helpers.ts:5-11`). A run whose findings are all filtered
out keeps its accordion and shows the existing `EmptyState`, whose copy already reads
"Adjust the filters above" (`client/messages/en/prReview.json` → `panel.noMatchBody`) —
written for exactly this. Hiding the accordion would also hide that run's verdict,
score, and timestamp, which are not findings.

### Dismissed findings still count

The counters report what the agent found, including findings since accepted or
dismissed. The number that already excludes dismissed ones is `blockers`
(`_components/ReviewRunAccordion/ReviewRunAccordion.tsx:53`), and it stays as it is.
Two numbers with two meanings beats one number that quietly means both.

### One colour map, one component

Both surfaces render from `client/src/components/severity-counts/`, which consumes
`SEV` (`client/src/vendor/ui/primitives/tokens.ts:6`).

This matters because there are already **three** severity→colour maps and they
disagree: `SEV` and `_components/FindingCard/constants.ts:4` both use `var(--sugg)`
for `SUGGESTION`, while
`_components/RunTraceDrawer/_components/FindingsSection/FindingsSection.tsx:12` uses
`var(--accent)`. Unshared severity rules are what produced that drift; a fourth map
would extend it.

The vendored `Chip` is consumed, not extended — `client/src/vendor/ui/` is on the root
`CLAUDE.md` "Do not touch" list. The design system has no popover primitive at all
(only native `title=`), so the hover card is a new DevDigest component under
`client/src/components/`, not an addition to `vendor/ui/`.

### Where it shows

| Surface | Shape | Scope | Interactive |
|---|---|---|---|
| PR list, `FINDINGS` column | `⛔2 ⚠2 💡2`, plus a hover card listing the findings | each agent's latest review | no |
| PR detail → Timeline, run row | `⛔2 ⚠1`, plus a hover card "N findings in this run" | that one run | no |
| PR detail → run toolbar | `Chip`s — `CRITICAL 2 · WARNING 1` | that one run | yes — filters |

The list chips are **not** clickable. A PR row is one navigation target
(`PRRow.tsx:25`); a `<button>` inside it either swallows that click or needs
`stopPropagation` to un-swallow it, and either way the same component would behave two
different ways on two surfaces. Hover shows the findings; the click still opens the PR.

## Consequences

- Migration `0011` adds `findings_review_idx` on `findings.review_id` and
  `reviews_pr_idx` on `reviews.pr_id`. Postgres does not index foreign keys
  automatically, and both new joins key on exactly these columns. The same indexes also
  speed the `ON DELETE CASCADE` fan-out behind `DELETE /reviews/:id`.
- `PrMeta` gains one nullable `findings_by_severity` object rather than three
  correlated nullable integers, which could disagree with each other.
- `FindingsBySeverity` is defined once in `contracts/findings.ts`. The identical shape
  is already hand-written in `contracts/observability.ts:111` and
  `contracts/productionize.ts:156`; those should adopt it when their lessons land.
- `GRID` and `COLUMN_KEYS` go back to 8 tracks and must stay in lockstep
  (`client/src/app/repos/[repoId]/pulls/constants.ts:28`, `:43-51`), or the header row
  and the PR rows misalign.
- `usePrReviews` and `usePrRuns` each gain an `enabled` argument so the hover card can
  defer its fetches. The query keys are unchanged, so the list and the detail page
  share one cache entry per key.
- The list endpoint now runs **two** queries for findings: the run-keyed aggregate, plus
  one for reviews with `run_id IS NULL`. The second exists solely to keep run-less
  reviews from being dropped, and cannot be folded into the first — a `LEFT JOIN` from
  `agent_runs` can never reach a review that has no run.
- `latestPerAgentRuns` needs run data, so anything showing counts must load runs as well
  as reviews (`client/src/components/severity-counts/helpers.ts`). The reviews-only
  `latestPerAgent` was deleted rather than left in place: a helper that cannot see runs
  cannot implement this rule, and keeping it invites a caller to reintroduce the bug.
- The counters inflate when the *same finding* is reported by *different* agents — each
  agent's latest review counts, and two agents finding the same N+1 query is two
  findings. Cross-agent dedup is a later lesson.
- `Chip` exposes no `aria-pressed`, so the active severity is conveyed visually only
  until the design system is revised upstream. Tests assert the filtered outcome, not
  an ARIA attribute.
- The PR list runs one more query per page load. No backfill and no new writes: every
  number is derived from rows that already exist.

## Acceptance criteria

1. `GET /repos/:id/pulls` returns `findings_by_severity: {CRITICAL, WARNING, SUGGESTION}`
   for a reviewed PR, and `null` for a PR that was never reviewed.
2. A reviewed PR with no findings returns `{0,0,0}` and the list renders a check, not `—`.
3. Re-running the same agent does not change the counts: the second review supersedes
   the first instead of adding to it. Two *different* agents do add up.
4. When an agent's newest run fails, is cancelled, or is still running, that agent
   contributes nothing — its earlier findings do **not** reappear — while the other
   agents' contributions are unaffected. Same for `cost_usd`.
5. A review with `run_id IS NULL` (seeded, or its run row deleted) counts even when
   every run on the PR failed.
6. A PR that has runs but no surviving review reads `null`, not `{0,0,0}` — it has
   never been reviewed, so it renders `—` rather than a clean check, consistent with
   `score` and `cost_usd` on the same row.
7. A finding whose severity is outside the three known values is ignored by every
   counter and never produces a fourth bucket.
8. The `FINDINGS` column shows one icon+count per non-zero bucket; clicking anywhere in
   the row — chips included — still navigates to the PR.
9. Hovering the column shows the PR's findings, and the card is not clipped by the
   table card's `overflow: hidden` even on the last row.
10. Clicking `CRITICAL` in a run's toolbar leaves only that run's CRITICAL findings
   visible, leaves the accordion and its `{n} findings` header unchanged, and leaves
   every other run untouched.
11. Clicking the active severity again restores all of that run's findings.
12. A run whose findings are all filtered out shows "No findings match" inside its own
   accordion.
13. Severity filtering and `Hide low confidence` compose: a low-confidence CRITICAL is
    hidden when both are active.
14. Dismissing a CRITICAL finding does not decrement any CRITICAL counter.
15. Zero additional model calls and zero new writes — every number is derived on read.
