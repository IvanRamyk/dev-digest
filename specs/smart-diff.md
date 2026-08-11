# Smart Diff — reviewer-ordered PR diff

Reorders a PR's "Files changed" by review risk — **core logic** first, then
**wiring**, then **boilerplate** collapsed at the bottom — with per-line finding
marks once a review has run. No LLM call: it deterministically joins two things
the app already persists.

## Context

Reviewing a PR means scrolling a flat file list in GitHub's arbitrary order, so a
`pnpm-lock.yaml` with +92/−24 sits between the two files that actually carry the
change. Smart Diff regroups those files by how much reviewer attention each one
deserves.

Everything the endpoint needs is already stored:

- `GET /pulls/:id` persists `files[{ path, additions, deletions, patch }]` into
  `pr_files`.
- A review persists `findings` with `file`, `start_line`/`end_line`, `severity`,
  linked through `reviews` to the `agent_runs` that produced them.

Classification works the instant a PR is imported; the finding overlay appears
after the first Run Review. The contract (`SmartDiff` in
`server/src/vendor/shared/contracts/brief.ts`) already existed and is returned
verbatim — no contract work was needed, and the client copy is in sync.

## Decision

### The classifier is a pure, ordered rule set — first match wins

`modules/smart-diff/classify.ts` exports `RULES: { role, match }[]` and
`classifyFile({ path, additions, deletions })`. The ordering is load-bearing:

1. lockfile basename → `boilerplate`
2. any generated directory segment (`dist`, `__snapshots__`, …) → `boilerplate`
3. generated suffix (`.snap`, `.d.ts`, …) → `boilerplate`
4. binary extension → `boilerplate`
5. test path → `wiring` (after 1–4, so `__snapshots__/x.snap` stays boilerplate)
6. doc path → `wiring`
7. config basename / regex / extension → `wiring`
8. entry-point basename **and** churn ≤ `BARREL_MAX_CHANGED_LINES` → `wiring`
9. otherwise → `core`

`core` is never pattern-matched, only defaulted to: an unknown extension degrades
toward "review it", the safe direction. Rule 8 is the one size-dependent rule —
a 200-line rewrite of `app.ts` is the substance of the PR, not wiring — and it is
the reason `classifyFile` takes the whole file, not just a path.

`constants.ts` holds every literal and imports nothing but the `SmartDiffRole`
type. It **deliberately does not** import `EXCLUDED_DIRS` from
`modules/repo-intel/constants.ts`: same names, different question (what to *index*
vs what a reviewer can *skip*), and coupling them would entangle reviewer-facing
classification with `INDEXER_VERSION` bumps.

### The per-line marks obey the same latest-run rule as the PR list

`helpers.ts:currentFindingRows` is the sibling of
`pulls/helpers.ts:foldFindingsByPr`. Each agent's **latest run** wins its slot;
a dead newest run (failed/cancelled/running — no `reviews` row) contributes
nothing and does not fall through to a superseded attempt; every `run_id IS NULL`
review always counts. Keying on `reviews` instead would resurrect a superseded
run's findings — a bug this repo already shipped and fixed
(`server/INSIGHTS.md` 2026-08-06, `specs/findings-by-severity.md`). Because the
server fold and the client's `latestPerAgentRuns` apply the same rule, the two
ends agree.

`buildGroups` always emits all three groups in `ROLE_ORDER`, including empty
ones, so `Σ group.files.length === files.length` is an assertable invariant.
Within a group, files sort by has-findings desc → worst severity → finding count
desc → churn desc → **path asc**; the path tiebreak makes the order stable across
requests. `buildSplitSuggestion` names each split by the **directory prefix
itself** (`src/api`) — never a server-authored English sentence, which could
never be translated.

### The endpoint is read-only and transport-thin

`GET /pulls/:id/smart-diff`: `routes.ts` parses (`IdParams`, so a non-uuid is a
422 before the handler) and delegates; `service.ts` loads the pull (404 if
absent), `Promise.all`s the three row sets, and folds
`currentFindingRows → buildGroups → buildSplitSuggestion` — no HTTP, no SQL, no
adapter, no LLM, no writes; `repository.ts` is the module's only drizzle site. No
`response` schema (no route in this codebase declares one; the contract is
asserted in tests via `SmartDiff.parse`) and no per-route rate limit (the global
120/min suffices, there is no expensive call to protect).

## Consequences, stated deliberately

- **`smart-diff/repository.ts` reads three tables the module does not own** —
  `pr_files` (pulls) and `agent_runs` / `reviews` / `findings` (reviews) — rather
  than importing `PullsRepository` or calling a facade. This mirrors the
  precedent the conventions module set and documented (`server/INSIGHTS.md`
  2026-08-08): a module needing another module's raw rows queries them from its
  own `repository.ts` rather than bloating the sibling's public surface. It is a
  deliberate, mild layering smell (those modules "own" the tables) traded for a
  scoped, fast implementation. Revisit only if the read contract on those tables
  starts churning under this module's feet.
- **The orphan (`run_id IS NULL`) query cannot be folded into the run query.** A
  LEFT JOIN *from* `agent_runs` can never reach a review that has no run, so a
  second query is structurally required — the same shape the PR-list rollup
  already carries.
- **`SmartDiffFile.finding_lines` is `number[]`, not severity-tagged.** The
  contract cannot carry per-line severity, so the *colour* of a mark is a
  client-side join over the reviews cache; the server owns grouping, ordering,
  counts, and which lines are marked. Both ends apply the same latest-run rule,
  so they stay consistent.
- **`pseudocode_summary` is always `null`.** The contract is `nullish`, and the
  "What this does" chip renders only when it is non-null, so it lights up for
  free when the Intent layer supplies summaries later. No column, no write today.
- **The new migration is `0013`, not `0012`.** The plan reserved `0012` for the
  index, but the Intent Layer landed `0012` first; `pnpm db:generate` correctly
  took the next number. The migration adds only
  `CREATE INDEX pr_files_pr_idx ON pr_files (pr_id)` — the FK had no index and
  `listFiles(prId)` is now a per-page-load read.
- **The seeded PR classifies as core 4 / wiring 2 / boilerplate 3**, not the
  "core 2 / wiring 3 / boilerplate 4" the plan's curl example guessed. The seed
  follows the plan's explicit file list (four existing core files, plus
  `package.json`/`src/index.ts` as wiring and `pnpm-lock.yaml`/`dist/bundle.js`/
  `__snapshots__/api.test.ts.snap` as boilerplate); the e2e assertions
  (`src/middleware/ratelimit.ts` under Core, `pnpm-lock.yaml` under Boilerplate)
  hold regardless.

## Acceptance criteria

1. `GET /pulls/:id/smart-diff` with a malformed id returns **422** before the
   handler; an unknown (but well-formed) uuid returns **404**
   `Pull request not found`.
2. A PR with no `pr_files` returns **200** with three empty groups in
   `ROLE_ORDER`, `total_lines: 0`, `too_big: false`.
3. A PR that has never been reviewed returns groups populated and every
   `finding_lines: []`.
4. After a review, each finding's inclusive `[start_line, end_line]` (deduped,
   sorted, a >`MAX_FINDING_LINE_SPAN` range collapsed to `start_line`) appears in
   the `finding_lines` of the matching file.
5. Re-running an agent drops its previous run's findings; the newest run's
   findings replace them.
6. An agent whose newest run **failed/cancelled/running** contributes nothing;
   other agents are unaffected.
7. A review with `run_id IS NULL` always contributes its findings.
8. `buildGroups` never drops or duplicates a file:
   `Σ group.files.length === files.length`, and the order is deterministic under
   input shuffle.
9. `SmartDiff.parse` accepts the endpoint's output (contract returned verbatim).
10. `pnpm db:seed` leaves nine `pr_files` rows on PR #482, each with a real
    `patch`, classifying to a non-empty `core` (incl. `src/middleware/ratelimit.ts`)
    and a `boilerplate` group containing `pnpm-lock.yaml`.
