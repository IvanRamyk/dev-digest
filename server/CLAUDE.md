# server — `@devdigest/api`

Architecture, DI flow, API map, and the env table live in `README.md`. Read it
before adding a route.

## Layer discipline

`platform/` infra · `adapters/` outside world behind interfaces · `modules/` features · `db/` schema

Inside a module: `routes.ts` holds no business logic · `service.ts` holds no HTTP
and **no raw SQL** (all persistence goes through `repository.ts`) · literals live
in `constants.ts` · pure transforms in `helpers.ts`.

## Read when

- Starting work here → read `INSIGHTS.md` first (dated history, not rules — this file
  wins on any conflict)
- Adding a module, service, repository, adapter, or port → read
  `.claude/skills/onion-architecture/SKILL.md` (ring map, inward-dependency rules)
- Adding a module → read the header of `src/modules/index.ts` (static registry:
  one import + one entry; registration is deliberately not filesystem autoload)
- Adding a table or column → read the header of `src/db/schema.ts`, then `pnpm db:generate`
- Adding an adapter → read `src/platform/container.ts` and add a `ContainerOverrides`
  entry so tests can inject a mock
- You need the table-by-table model or tenancy rules → read `docs/db-model.md`
- Working on jobs, indexing, or run lifecycle → read `docs/jobs-and-runs.md`
- Writing a DB-backed test → read `../TESTING.md`

## Gotchas

- **`tsx watch` + boot-time reaping kills live runs.** Boot marks *every*
  `status='running'` row failed (`app.ts` `reapStaleRuns`), so saving any server
  file mid-review restarts the process and fails that review.
- **Jobs are an in-memory p-queue; the `jobs` table only mirrors status.** Nothing
  is recovered on restart — `queued`/`running` rows are orphaned forever.
- **Job concurrency is 3 process-wide and not FIFO across kinds.** Anything
  enqueued as a follow-up must be safe to run out of order.
- **Reviews do not go through `JobRunner`.** `POST /pulls/:id/review` is a bare
  fire-and-forget promise: no timeout, no retry, no queue.
- **Bump `INDEXER_VERSION`** (`modules/repo-intel/constants.ts`) whenever the
  parser or symbol schema changes, or rows from two versions will mix.
- **Secrets: only via `SecretsProvider`** — never `process.env` or `AppConfig`.
  After writing a key call `container.invalidateSecretCaches()`.
- **repo-intel facade methods must degrade**, returning `[]` or `degraded: true`.
  They must never throw: every consumer treats a failure as "no context".
- **A DB-backed test must be named `*.it.test.ts`** or the unit/integration split
  silently breaks (unit runs would then need Docker).
- Symbol names written to indexed columns must go through `clampIndexedName`
  (`db/schema/context.ts`) — Postgres rejects btree rows over ~2704 bytes.
