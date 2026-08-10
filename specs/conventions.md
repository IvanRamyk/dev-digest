# Conventions Extractor — scan a repo for house rules, turn them into a Skill

Scans a cloned repo, proposes convention candidates each backed by real evidence,
lets the user accept/reject/edit them, and merges the accepted ones into a single
`<repo>-conventions` Skill through the existing Skills Lab create path.

## Context

L02 shipped Skills: markdown rule-blocks bound to agents and injected into the
prompt. Every skill was hand-written — the user had to already know their own
conventions and type them out, which is exactly the work this feature automates.

Most of the scaffolding already existed and was inert: the `conventions` table
(empty placeholder), the `ConventionCandidate` Zod contract (zero consumers),
`repoIntel.getConventionSamples(repoId, n)`, the `FEATURE_MODELS` entry
`id: "conventions"`, `SettingsService.featureModelOverride`'s doc comment
literally naming conventions, `MockLLMProvider.structuredBySchema`'s hint naming
`'ConventionExtraction'`, `activeKeyFor(pathname) → "conventions"`, and the i18n
copy for the page. The missing pieces were the module, the pipeline, the page,
and the sidebar entry.

The model is the *weakest* link here, so the design deliberately minimises its
authority: it proposes rules and where to look; **code decides** whether a rule
survives. Most raw candidates are expected to be invalid — the pipeline's job is
to throw them away cheaply.

## What counts as a convention

> A convention is a repeated choice among viable alternatives that the team made
> consistently and never wrote down.

Two mechanical tests, both stated in the extraction prompt: does the tooling stay
silent (if a linter/compiler would already catch a violation, a review agent
gains nothing from restating it), and does the answer differ from the ecosystem
default (otherwise it's generic advice, not knowledge about *this* repo).

**The load-bearing insight of the feature:** conventions split into five logical
shapes — chokepoint (A), contract-on-a-role (B), form-choice (C), placement (D),
and layering (E) — and A, B, and E are graph/population properties **invisible
inside any single file**. A pipeline that only shows the model batches of file
bodies can find C and D and nothing else. So the pipeline is split by type: for
A/B/D/E **code mines the candidate and the model only phrases it**; for C the
model proposes and code counts.

## Decision

### Pipeline (S0–S9)

`ConventionsService.runScan` (`server/src/modules/conventions/service.ts`), one
job (`SCAN_JOB_KIND = 'conventions-scan'`) per scan row:

1. **S0 Claim** — bail unless `status === 'queued'`; no `clone_path` → `failed` +
   `degraded_reason: 'not_cloned'`.
2. **S1 Config rules** (`config-rules.ts`) — deterministic, no model, confidence
   1.0, persisted immediately so a later failure still leaves something useful.
3. **S2 Samples** — `repoIntel.getConventionSamples`; on `[]`, falls back to
   `codeIndex.grep(repoRef, '^\s*(import|export)\s')` → distinct paths →
   `isSamplePath`; still `[]` → finishes `done` with `no_samples`, zero LLM calls.
4. **S3 Read** — `git.readFile` per sample (try/catch, truncate to
   `MAX_FILE_BYTES`), kept in a `Map<path, string[]>` the verifier reuses.
5. **S3b Structural mining** (`miners.ts`, code, no model) — `mineChokepoints`,
   `mineRoleContracts`, `mineLayering`, `minePlacement`, each pure over rows the
   repository hands them, each already carrying its own support/violation counts
   and each applying the **"could it be otherwise" test**: a regularity with no
   viable alternative present in the repo is discarded before the model ever
   sees it (this is what keeps "every file imports react" out — see
   `mineChokepoints`'s `internalImporters.length !== 1` guard).
6. **S4a Phrase mined patterns** (model, cheap) — one structured call turns
   `MinedPattern[]` into prose, in the same order, unable to invent a rule since
   the pattern is already proven. Lands `verification: 'pattern'` with the
   miner's own counts.
7. **S4b Extract from file bodies** (model) — grouped into batches
   (`groupFilesIntoBatches`, capped at `MAX_BATCHES`), waves of
   `BATCH_CONCURRENCY`, soft-budget checked between waves.
8. **S5 Reduce** — drop junk (`isJunkRuleText`) and Prettier restatements
   (`isPrettierRestatement`) → `normalizeRuleKey` → `dedupeCandidates` (a
   config-sourced row always wins its group) → sort by `(rank, rule_key)` for a
   **stable judge order**, so the same repo yields the same judged rules run to
   run.
9. **S6 Verify** (`verifier.ts`) — evidence anchoring (§ below) → S6a ast-grep
   pattern counting → S6b LLM-as-judge fallback, budget-capped at
   `MAX_JUDGE_CALLS`.
10. **S7 Persist** — upsert on `(repo_id, rule_key)`; on conflict, refresh
    evidence/counts/confidence/`scan_id` but **never** `status`/`accepted`, and
    `rule` text only while still `pending`. Then delete stale `pending` rows not
    re-found this scan.
11. **S8 Finish** — `done`, counts, tokens, `cost_usd` (`null` = unpriced, not
    a literal 0).
12. **S9 Reaper** — `reapStaleScans()` at plugin load (precedent:
    `reapStaleRuns` in `server/src/app.ts`); necessary because `JobRunner` is an
    in-memory queue, so any scan left `queued`/`running` from a prior process is
    permanently orphaned.

The job handler never rethrows: `JobRunner` wraps handlers in `withRetry(2)`, so
a throw after N model calls would triple the bill. Every failure path writes a
stable code to `convention_scans.error` (never a raw provider message — it can
carry a key fragment) and resolves the scan.

### Evidence verification is hybrid: code proves existence, LLM judges semantics

Code answers the mechanical questions (does `file:line` exist? does this pattern
match?); the LLM is not needed there and would only add noise. But a purely
pattern-based check silently kills real semantic rules ("all public handlers
return `Result<T, ApiError>`"), because the pattern would itself be
model-authored. So the model self-classifies each S4b rule `pattern` or
`semantic` — a hint, not a contract: an uncompilable pattern still falls through
to the judge rather than being dropped.

Anchoring (`anchorEvidence`): path-safety guard → resolve in the sample map (or
one `git.readFile`, caught) → search a `±2`-line window around the claimed
location → **self-heal** by scanning the whole file on a miss → drop on a miss
everywhere. The persisted snippet is **always re-derived from the file**, never
the model's text — this also neutralises a model echoing injected repo text back
into the card.

### Verification states and confidence

`verification` is one of `config | pattern | semantic | unverified`.
`confidence` is **always computed, never model-reported**:
`config → 1`, `unverified → 0.3` (flat cap), else Laplace-smoothed
`support / (support + violation + 1)`.

A candidate is **dropped** (never persisted) when evidence anchoring fails — a
hallucinated path is a hallucinated rule. It is **refuted** (verification ran
cleanly, came back negative) when a compiling pattern's support is below
`MIN_SUPPORT_FILES`, or violation outnumbers support (either method) — refuted
candidates are simply not persisted. It is kept **`unverified`** — badged, capped
at 0.3, sorted last, still persisted — when verification *could not run*
(pattern didn't compile and the judge budget was exhausted, no neighbour files,
a judge call threw). This is the asymmetry that matters: *"we checked and it's
false"* and *"we couldn't check"* are different facts, and only the first
justifies hiding a finding.

### Config rules are filtered by "does the tooling stay silent", not by category

`config-rules.ts` keeps parsing eslint/tsconfig/package.json, but only emits
rules the tooling does not already enforce for the reviewer
(`no-restricted-imports`, `no-restricted-syntax` with a message,
`import/no-default-export`, `@typescript-eslint/no-floating-promises`, the
`extends` meta-rule, four `tsconfig` flags, `moduleResolution: NodeNext`,
non-empty `paths`, `"type": "module"`, a pinned `packageManager`). Prettier's
config is parsed but **always returns `[]`** — every key it can carry is
auto-rewritten by the formatter — and any *model*-authored candidate that merely
restates a formatting concern is filtered in S5 regardless of source
(`isPrettierRestatement`), independent of whether a `.prettierrc` was found.

### One merged skill, editable before save

Accepted candidates merge into a single `<repo>-conventions` skill (type
`convention`) via `helpers.buildSkillBody` — the one home for the merge rule:
`# <repo> conventions` → intro → `## <Category>` sections in `CATEGORY_ORDER`,
each rule with its evidence line (`from project config` for config rows). The
client's `CreateSkillModal` prefills from `POST /skill-preview` (a mutation
fired on open, so it reflects the latest inline edits and never lands in the
query cache) and everything stays locally editable before the **existing**
`POST /skills` persists it — no new write path. On success the modal closes and
a toast offers "Open in Skills Lab" as an action, not a redirect, so the user
keeps their scan context (`client/src/lib/toast.tsx` gained an optional
`action` on `notify.success` for this).

## Consequences, stated deliberately

- **`conventions/repository.ts` queries `file_edges`, `file_facts`, and
  `symbols` directly** rather than extending the repo-intel facade. The facade
  (`modules/repo-intel/types.ts`) exposes no raw-row reads, and adding a
  generic "give me every edge" method for exactly one caller would be the wrong
  kind of generality. This is a deliberate, mild layering smell (repo-intel
  "owns" those tables) traded for a scoped, fast implementation — revisit only
  if a second module needs the same raw reads.
- **S6b always judges over nearest-neighbour sample files, never the mined
  population.** The design note that "type B rules should ideally be judged
  over the mined population, not 5 neighbour files" describes a refinement this
  implementation does not carry: a mined role-contract candidate (S4a) always
  lands `verification: 'pattern'` directly from the miner's own counts and never
  reaches S6b at all, so the distinction is moot for mined candidates — the gap
  is a *model-proposed* semantic rule that happens to resemble a role contract,
  which still gets judged over neighbour files rather than cross-checked against
  a mined population. Acceptable: it's the same neighbour-file mechanism the
  rest of S6b already uses, just without the (unimplemented) cross-check.
- **The `unverified` badge does not surface *why*** (pattern didn't compile vs.
  judge budget exhausted vs. no neighbour files) — the schema tracks
  `verification: 'unverified'` but not a reason code, so the UI shows a single
  generic "not verified" chip. Revisit by adding an `unverified_reason` column
  if the distinction turns out to matter to users.
- **`mineLayering`'s directory grouping skips a leading `src/` segment** before
  taking "the first path segment", so `src/platform/x.ts` groups under
  `platform` and a single-package repo's own onion layering
  (`platform`/`adapters`/`modules`/`db`) is discoverable — a literal first
  segment would just yield `src` for everything. A monorepo (paths like
  `client/…`, `server/…`) still groups correctly since there's no leading `src`
  to skip. This heuristic is declared, not hidden — see `layeringDir` in
  `miners.ts`.
- **The sidebar nav entry is a deliberate vendored-file edit.**
  `client/src/vendor/ui/nav.ts` has no in-tree upstream and `ShellContext` has
  no nav extension point, so the one-line addition
  (`{ key: "conventions", …, href: "/conventions", gKey: "c" }`) is the
  documented exception to "do not touch `vendor/ui/`" — the alternative was an
  unreachable page. `activeKeyFor` and the `nav.conventions` i18n key already
  anticipated it.
- **`MAX_GREPS_PER_SCAN` is a declared ceiling that the current implementation
  never approaches** — the only ripgrep call per scan is the single S2 fallback
  sampler. It exists as a documented budget for a future S6a retriever path
  that isn't built (S6a currently counts in-process via `@ast-grep/napi` against
  the already-loaded S3 content map, no subprocess).
- Cost is bounded hard: `MAX_BATCHES=6` + `MAX_JUDGE_CALLS=8` → **≤ 14 model
  calls per scan**, byte/line caps on every prompt, `maxTokens` capped, the
  handler never throws (no retry storm), and an already-active scan
  short-circuits (`getActiveScan`) rather than double-running.

## Control experiment

Run this manually against `./scripts/dev.sh`:

1. Add a repo, wait for clone + index. Open `/conventions` → **Run extraction**.
2. Header shows a real sample count; candidates appear grouped, each with
   `path:lines` you can click through and a support count.
3. **The acceptance bar for the whole feature:** at least one type A
   (chokepoint) or type E (layering) rule appears. If the list is entirely type
   C ("use async/await", "prefer named exports"), the miners are mis-tuned and
   the feature has not delivered — that is the failure mode to watch for, not a
   crash. Run it against `dev-digest` itself: it should surface the
   `vendor/shared` single-source rule (a chokepoint) and hints of the server's
   onion layering.
4. **Falsification check:** pick a candidate and open its evidence file — the
   cited lines must actually show the rule. Any candidate failing this is a
   verifier bug, not a model bug. Then check a `semantic`-badged card: open two
   of the files the judge counted as "follows" and confirm they really do.
5. Reject an obviously wrong rule, edit a nearly-right one, accept 3.
6. **Create skill** → body contains exactly the 3 accepted rules, grouped, with
   evidence. Edit the name, save → it appears in Skills Lab as `v1`.
7. Link it to an agent on the agent Skills tab, run a review, open the trace →
   the `## Skills / rules` block contains the conventions body.
8. **Re-scan** → accepted 3 still accepted, the rejected one still rejected,
   counts refreshed.

## Acceptance criteria

1. `POST /repos/:id/conventions/scan` returns 202 immediately; a second call
   while the first is still `queued`/`running` returns the **same** `scan_id`.
2. A scan with no API key configured still persists every config-derived
   candidate, then resolves `failed` with `error: 'no_api_key'` — never left
   `running`, never a raw provider message.
3. A scan whose `repoIntel.getConventionSamples` and grep fallback both return
   `[]` resolves `done` with `degraded_reason: 'no_samples'` and **zero** LLM
   calls.
4. Every persisted candidate's `confidence` matches `computeConfidence`'s
   formula for its `verification` — never a value the model returned.
5. A candidate whose evidence is a hallucinated file or unfindable snippet never
   reaches the `conventions` table.
6. A pattern-verifiable candidate with `support < MIN_SUPPORT_FILES`, or with
   `violation > support`, is absent (refuted) — not shown as low-confidence.
7. An uncompilable `support_pattern` falls through to the LLM judge rather than
   being dropped; a judge call that throws still lands the candidate
   `unverified`, not a failed scan.
8. Re-scanning a repo preserves every `accepted`/`rejected` candidate's status
   and rule text, refreshes evidence/counts/`scan_id` for everything re-found,
   and deletes any `pending` candidate not re-found — never touching a
   user-decided row.
9. `POST /repos/:id/conventions/skill-preview` 400s (`no_accepted_candidates`)
   at zero accepted candidates and otherwise returns a body containing exactly
   the accepted rules, grouped by category, each with its evidence line.
10. `pnpm db:seed` leaves one `done` scan and three `conventions` rows (one
    `accepted`/`pattern`, one `pending`/`semantic`, one `pending`/`config`) for
    `acme/payments-api`, re-runnable without duplicating rows.
