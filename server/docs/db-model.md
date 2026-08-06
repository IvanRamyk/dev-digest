# Database model

Drizzle + Postgres 16 with pgvector. The schema is split by domain under
`src/db/schema/` and re-exported through the barrel `src/db/schema.ts`, so every
consumer keeps importing from `db/schema`.

Migration `0000_init.sql` creates **all 35 tables at once**. Later migrations only
add columns. Nothing migrates on boot — applying them is always a manual step
(`pnpm db:migrate`).

## Rules that hold everywhere

- **Tenancy.** Every domain table carries `workspace_id` referencing `workspaces`
  with `ON DELETE CASCADE`, and `created_by` where a user is meaningful. Queries
  scope through `getContext()` (`modules/_shared/context.ts`), which resolves the
  workspace via `AuthProvider` — in MVP always the seeded default.
- **`created_at`** comes from the `now()` helper in `schema/_shared.ts`
  (timestamptz, `defaultNow()`, not null). That helper is intentionally not
  re-exported by the barrel.
- **Non-secret prefs go in `settings`** (workspace + user + key, unique). Secrets
  never do — they live in `~/.devdigest/secrets.json`.
- **1:1 tables use the parent id as the PK**, no surrogate: `repo_index_state`,
  `run_traces`, `pr_intent`, `pr_brief`, `onboarding`.

## Live tables

### Repos and pull requests

| Table | Notes |
|-------|-------|
| `repos` | unique on `(workspace_id, full_name)`; `clone_path` is null until the clone job finishes |
| `pull_requests` | unique on `(repo_id, number)` — that is what makes import idempotent |
| `pr_files` | carries the GitHub `patch`, which lets a review run with no clone present |
| `pr_commits` | per-PR commit list |

`pull_requests.status` holds **GitHub's merge state** (open/merged/closed). The
review-freshness status shown in the UI (`needs_review` / `reviewed` / `stale`) is
**not stored** — `deriveReviewStatus` (`modules/pulls/status.ts`) computes it on read
from `last_reviewed_sha` vs `head_sha` plus age. So a moved head automatically means
`needs_review`.

### Agents

`agents` holds provider, model, `system_prompt`, plus three behaviour switches:
`strategy` (single-pass / map-reduce / auto), `ci_fail_on` (the gate policy that
drives blockers), and `repo_intel` (per-agent context opt-out).
`agent_versions` snapshots config as jsonb, PK `(agent_id, version)`.

### Reviews, findings, runs

| Table | Notes |
|-------|-------|
| `reviews` | one row per agent pass; `verdict`, `summary`, `score`, `model` |
| `findings` | cascades from `reviews`; `start_line`/`end_line` are what the grounding gate checks |
| `agent_runs` | the timeline row: status, tokens, duration, `grounding`, `score`, `blockers`, `error` |
| `run_traces` | PK = `run_id`; the **entire** trace as one jsonb document |

Two traps here:

**`reviews.run_id` has no FK to `agent_runs`.** Deleting a run therefore has to
delete the review explicitly, or its findings (which do cascade from `reviews`)
would be orphaned in the UI. `deleteAgentRun` in
`modules/reviews/repository/run.repo.ts` does both.

**`run_traces` is one document, not an event table.** The live log lives in RAM
during the run and is written once on completion. Nothing appends to it row by row.

### repo-intel

| Table | Notes |
|-------|-------|
| `repo_index_state` | 1:1 per repo; `indexer_version` mismatch forces a full reindex |
| `file_edges` | import graph; the `(repo_id, to_file)` index is what makes "who depends on this?" O(degree) |
| `file_rank` | PageRank per file; `hotness` is always 0 in v1 (shallow clone, no churn window) |
| `file_facts` | precomputed endpoints and crons, so blast never re-parses the clone |
| `repo_map_cache` | PK `(repo_id, commit_sha, token_budget)` — deterministic, so it is a stable prompt-cache prefix |
| `symbols`, `references` | ast-grep output; `references.decl_file` NULL means unresolved |

`symbols.line` carries start-line semantics (kept as-is so pre-T2 rows survived the
migration). Names written to `symbols.name` and `references.to_symbol` must pass
through `clampIndexedName` — both columns are btree-indexed and Postgres rejects
index rows over ~2704 bytes, so one bad parse capturing a whole expression as an
identifier used to crash the indexer.

### Ops

`jobs` mirrors the in-memory queue (see [`jobs-and-runs.md`](jobs-and-runs.md)).

## Placeholder tables

Created by migration `0000`, read by **no module**. They fill up as course lessons
land, so an empty one is expected, not a bug:

| Table | Lesson it belongs to |
|-------|----------------------|
| `skills`, `skill_versions`, `agent_skills` | L02 — skills in the product |
| `conventions` | L02 — conventions extractor |
| `pr_intent` | L03 — intent layer |
| `code_chunks`, `onboarding` | L05 — project context, onboarding generator |
| `pr_brief` | L05 — PR brief card |
| `eval_cases`, `eval_runs`, `conformance_checks` | L06 — eval pipeline, plan verifier |
| `ci_installations`, `ci_runs`, `composed_reviews` | L06 — export to CI |
| `memory` | L07 — persistent memory |
| `multi_agent_runs` | L07 — multi-agent review |
| `installed_plugins`, `digests` | L08 — plugins, weekly digest |

`code_chunks.embedding` and `memory.embedding` are `vector(1536)`, pinned to OpenAI
`text-embedding-3-small`. The extension is enabled by migration `0000`, and
`runMigrations` creates it before applying anything.

## Changing the schema

1. Edit the right file under `src/db/schema/` (add it to the barrel if it is new).
2. `pnpm db:generate` — writes the SQL plus a `meta/_journal.json` entry.
3. `pnpm db:migrate`.
4. Never edit an already-applied migration; add a new one.
