# Architecture

How the pieces fit, where data lives, and which parts of the schema are real. The
per-package READMEs cover each package's own internals; this file covers the seams
between them.

## Package topology

Four standalone packages, deliberately **not** a pnpm workspace:

```
server/         @devdigest/api             Fastify API — all I/O, all state
client/         @devdigest/web             Next.js studio — presentation only
reviewer-core/  @devdigest/reviewer-core   pure review engine — zero I/O
e2e/            @devdigest/e2e             deterministic browser flows
```

Each has its own `package.json` and lockfile; `server` and `client` use pnpm,
`reviewer-core` and `e2e` use npm.

Code is shared through **tsconfig path aliases, not published packages**:

| Alias | Resolves to | Used by |
|-------|-------------|---------|
| `@devdigest/reviewer-core` | `reviewer-core/src/index.ts` | server |
| `@devdigest/shared` | `server/src/vendor/shared/index.ts` | server, reviewer-core |
| `@devdigest/shared` | `client/src/vendor/shared/index.ts` | client (**separate copy**) |
| `@devdigest/ui` | `client/src/vendor/ui/index.ts` | client |

Two consequences worth internalising. First, the server imports **raw `.ts`** from
`reviewer-core` — that package never emits JS, so its deps must be installed or the
API dies at boot with `ERR_MODULE_NOT_FOUND` (`scripts/dev.sh` handles this).
Second, `reviewer-core` resolves `@devdigest/shared` into a directory *inside*
`server/`, while the client keeps its own hand-synced copy — copies instead of a
workspace package, so nothing propagates and TypeScript never flags the drift.

## Data flow, end to end

```
POST /repos {url}
  └─ repos/service.ts — parse URL, dedupe, insert row, enqueue CLONE_JOB
       └─ git clone --depth=1 → ~/.devdigest/workspace/<owner>/<repo>
            └─ enqueue INDEX_JOB (not a direct call — the clone job closes fast)
                 ├─ walk + filter               pipeline/walk.ts
                 ├─ ast-grep → symbols, references
                 ├─ dependency-cruiser → file_edges
                 ├─ PageRank → file_rank
                 └─ render repo map under a token budget → repo_map_cache

GET /repos/:id/pulls
  └─ Octokit list → upsert pull_requests (idempotent on repo_id + number)
     Serves persisted rows when no token is configured — never fails the read.

POST /pulls/:id/review {agentId | all:true}
  ├─ create agent_runs rows (status='running') and return runIds IMMEDIATELY
  ├─ background: reviewPullRequest() from reviewer-core
  │    assemble prompt → single-pass or map-reduce → reduce → grounding gate
  ├─ persist reviews + surviving findings, mark pull.lastReviewedSha
  └─ stream progress over SSE: GET /runs/:id/events
       on completion the whole log is written as ONE run_traces document
```

The HTTP response returns before the work does. The client holds the `runId`,
subscribes to SSE, and falls back to self-quenching polls.

## Where things live

| Data | Location | Why |
|------|----------|-----|
| Domain state | Postgres 16 + pgvector | the only Docker service |
| API keys | `~/.devdigest/secrets.json`, mode `0600` | never in the DB or git |
| Repo clones | `~/.devdigest/workspace/` (or `DEVDIGEST_CLONE_DIR`) | git-ignored |
| Live run log | RAM (`platform/sse.ts` `RunBus`) | persisted to `run_traces` at the end |
| Job queue | RAM (p-queue) | the `jobs` table only mirrors status |

The `Container` (`server/src/platform/container.ts`) is the composition root:
config, db, lazily-built adapters, `JobRunner`, `RunBus`. Tests inject mocks via
`ContainerOverrides`, so services depend on interfaces rather than classes.

## The database model

Full table-by-table detail: [`../server/docs/db-model.md`](../server/docs/db-model.md).
The shape in one view — every domain table carries `workspace_id` with
`ON DELETE CASCADE`:

```
workspaces ─┬─ users · workspace_members · settings
            ├─ repos ─┬─ pull_requests ─┬─ pr_files (carries `patch`)
            │         │                 └─ pr_commits
            │         ├─ repo_index_state (1:1, PK = repo_id)
            │         ├─ file_edges · file_rank · file_facts
            │         ├─ repo_map_cache (PK = repo + sha + budget)
            │         └─ symbols · references
            ├─ agents ─── agent_versions
            ├─ reviews ─── findings
            ├─ agent_runs ─── run_traces (1:1, whole trace = one jsonb doc)
            └─ jobs
```

Roughly two thirds of the ~35 tables are **empty placeholders** created by
migration `0000` for later course lessons: `memory`, `conventions`, `code_chunks`,
`onboarding`, `eval_cases`, `eval_runs`, `ci_runs`, `multi_agent_runs`,
`installed_plugins`, `digests`, `pr_brief`, `skills`. No module reads them yet — an
empty table here is not a bug.

## Degradation as a design rule

Every external dependency has a defined "absent" behaviour, so the studio stays
usable offline and key-free:

- `REPO_INTEL_ENABLED=false` → the facade returns `[]` and the prompt is
  byte-identical to the pre-repo-intel shape.
- No GitHub token → `/pulls` serves persisted PRs instead of a 500.
- No clone → the reviewer reconstructs a diff from `pr_files.patch`.
- Embeddings default to off, and `container.embedder()` throws **before**
  constructing the OpenAI client, guaranteeing zero requests.
- repo-intel facade methods return `degraded: true` rather than throwing.

## Design decisions

Non-obvious choices, deliberate in every case:

- **Code computes score, verdict, and blocker count** from finding severities — never
  the model's self-report.
- **An in-process p-queue instead of a broker.** Nothing survives a restart; the `jobs`
  table only mirrors status.
- **Vendored contract copies instead of a workspace package.** `server/src/vendor/shared/`
  is the source of truth; every other copy is hand-synced.
- **Migrations stay a manual step** — nothing migrates on boot.
