# Insights — server

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

- 2026-08-06 — a "latest per agent" aggregate keyed on the **`reviews`** table silently resurrects a superseded run: `insertReview` sits inside the `try` on the success path only (`src/modules/reviews/run-executor.ts:220`, the sole caller), so a failed / cancelled / still-running run writes NO `reviews` row, and the dedup cannot tell "re-run, and it died" from "never re-run" → key it on `agent_runs` and LEFT JOIN out to `reviews` then `findings`, so the dead newest row wins the `(pr_id, agent_id)` slot and contributes nothing (`src/modules/pulls/routes.ts:174-206`)
- 2026-08-06 — …but keying *purely* on `agent_runs` then drops every review with `run_id IS NULL`, and the seeded demo review is one (no `agentId`, no `runId`, no `agent_runs` row at all — `src/db/seed.ts:136-148`; narrower case of the 2026-08-05 seed entry under Codebase Patterns). On the seeded PR all five real runs found 0 findings and both visible findings live on that row, so the column silently reads `{0,0,0}` — a regression that looks like "works fine, nothing found" → add a second query for `run_id IS NULL`; it cannot be folded into the first, because a LEFT JOIN *from* `agent_runs` can never reach a review that has no run (`src/modules/pulls/routes.ts:224-237`)
- 2026-08-06 — a test fixture that inserts a bare `reviews` row with an `agentId` but no `runId` is a shape production never creates, and it passes against both the buggy and the fixed aggregate → build run-based fixtures (`agent_runs` row first, then the review carrying its `runId`) or the test proves nothing about superseding (`test/reviews.it.test.ts:339`)

## Codebase Patterns

<!-- conventions and architecture that are not obvious from reading the code -->

- 2026-08-08 — the repo-intel facade (`modules/repo-intel/types.ts`) exposes no
  raw-row reads over `file_edges`/`file_facts`/`symbols` — only aggregated/degraded
  views (`getBlastRadius`, `getSymbolsInFiles`, …). The conventions miners need the
  raw import graph and endpoint population, and adding a generic "give me every
  edge" facade method for a single caller would be the wrong kind of generality →
  a module that needs raw repo-intel-owned table reads queries them directly from
  its own `repository.ts` (a declared, deliberate layering smell) rather than
  bloating the facade (`server/src/modules/conventions/repository.ts:83-159`, the
  trade-off is written up in `specs/conventions.md` → Consequences)
- 2026-08-08 — `conventions.accepted` (boolean) looks like dead weight once
  `status` (`pending|accepted|rejected`) exists, but `PluginConvention`
  (`server/src/vendor/shared/contracts/productionize.ts:60`) — a later lesson's
  export/import contract — still reads that exact boolean column. Dropping it in
  favor of `status` alone breaks that contract silently until the lesson ships
  → keep it as a written mirror of `status === 'accepted'`, updated by the
  repository on every status write, never read elsewhere
  (`server/src/modules/conventions/repository.ts:203-214`)
- 2026-08-06 — "the last batch of agents" is **not expressible** in this schema: `POST /pulls/:id/review {all:true}` creates one `agent_runs` row per agent in a plain for-loop (`src/modules/reviews/service.ts:119-129`), each taking its own `ranAt defaultNow()` (`src/db/schema/runs.ts:15`) — a real 3-agent batch in the dev DB was spread over 20 ms (`…18.983`, `…18.991`, `…19.003`) with nothing shared, and `multi_agent_runs` is an empty L07 placeholder with no reverse FK from `agent_runs` → before designing anything per-batch, check whether the ask reduces: "the last batch **plus** the agents it didn't touch" unfolds recursively into exactly "each agent's latest run", which the code already did, so no `batch_id` column and no migration were needed (`src/db/schema/runs.ts:44-53`)
- 2026-08-05 — the seed writes a `reviews` row + its findings but **no `agent_runs` row** (`grep agentRuns src/db/seed.ts` → nothing; reviews at `src/db/seed.ts:137`, findings at `:150`), so on seeded data the PR-detail Timeline renders zero run rows and the run-history API returns `[]` → anything that renders *per timeline run* cannot be asserted by an e2e flow against the seed; cover it with a client component test instead, and do not read an empty Timeline as a bug (`server/src/db/seed.ts:137`)

## Tool & Library Notes

<!-- version constraints and quirks of deps and the toolchain -->

- 2026-08-11 — passing a Zod contract that has `.default()` fields as the
  `schema` of `llm.completeStructured({ schema })` (e.g. `Intent` with
  `confidence`/`sources`/`missing_context` defaults) does two non-obvious things:
  (a) `T` infers to the schema's INPUT type, where the defaulted fields are
  OPTIONAL — so a downstream `intent.confidence` reads as `"…"|undefined` and the
  assignment to the OUTPUT `Intent` fails to typecheck; (b) the OpenAI SDK's
  `zodResponseFormat` prints `uses .optional() without .nullable() … not supported
  by the API` warnings on every structured call. Neither is fatal here (the mock
  parses; providers tolerate it) → drop the explicit `<Intent>` type param and
  re-parse the result with `IntentSchema.parse(res.data)` to recover the OUTPUT
  type; leave the contract's `.default()`s alone unless a real OpenAI structured
  call starts erroring, in which case the fix is `.nullable().default()` in the
  contract, not the caller (`server/src/modules/intent/service.ts:118-125`)
- 2026-08-08 — `@ast-grep/napi`'s `root.findAll({ rule: { pattern } })` does
  **not** throw on a syntactically garbage pattern (e.g. unbalanced parens like
  `)))not a real pattern(((`) — it just runs and returns zero matches, the same
  outcome as "compiled fine, rule genuinely absent". A `try/catch` around
  `findAll` therefore cannot distinguish "uncompilable pattern → fall through to
  the LLM judge" from "compiled, support is legitimately 0" → pre-validate with a
  cheap bracket-balance check before calling ast-grep at all if the two cases
  need different handling (`server/src/modules/conventions/verifier.ts:170-183`,
  `isWellFormedPattern`)

## Recurring Errors & Fixes

<!-- Symptom / Cause / Fix blocks, newest first -->

### 2026-08-05 — DOCKER_HOST alone is no longer enough for the integration lane (narrows the entry below)

**Symptom:** with `DOCKER_HOST` exported exactly as the entry below prescribes, the
integration lane still failed — but with a *different* error than that entry
describes, and now inside the container's startup wait rather than the runtime
lookup:

```
Error: Log stream ended and message "/.*Started.*/" was not received
 ❯ LineStream.<anonymous> .../testcontainers/src/wait-strategies/log-wait-strategy.ts:57:18
 Test Files  1 failed (1)   Tests  10 skipped (10)
```

**Cause:** two separate Rancher gaps, and the entry below only closes the first.
`DOCKER_HOST` gets testcontainers to the daemon, so the runtime lookup succeeds —
but testcontainers then computes the *bind-mount source path* for the socket it
hands to Ryuk from the same value, and `~/.rd/docker.sock` is not a path the
Rancher VM can bind, so the container never reaches its `Started` log line and the
wait strategy times out. Because the failure lands in a log-wait rather than a
connection error, nothing in the message points at the socket.

**Fix:** export **both** — the second tells testcontainers what path to bind
*inside* the VM, independently of how the host reaches the daemon:

```sh
export DOCKER_HOST="unix://$HOME/.rd/docker.sock"
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
pnpm exec vitest run .it.test
```

Measured, not assumed: 3 consecutive runs pass with both set, 3 consecutive runs
fail with only `DOCKER_HOST`. The `TESTCONTAINERS_RYUK_DISABLED=true` the entry
below mentions as "not proven necessary" was **not** needed in any of the six.

Note the two failure modes are easy to conflate — both end in a red integration
lane with every test "skipped". Read which frame threw: `client.ts` →
`DOCKER_HOST` is missing (the entry below); `log-wait-strategy.ts` → the socket
override is missing (this entry).

### 2026-08-05 — integration lane: "Could not find a working container runtime strategy"

**Symptom:** `pnpm exec vitest run .it.test` failed all 6 integration files at
`startPg` (`server/test/helpers/pg.ts:36`) while `docker ps` worked fine and the
dev Postgres container was healthy:

```
Error: Could not find a working container runtime strategy
 ❯ getContainerRuntimeClient .../testcontainers/src/container-runtime/clients/client.ts:63:9
 ❯ Module.startPg test/helpers/pg.ts:36:21
```

**Cause:** Docker here is **Rancher Desktop**, whose socket is
`~/.rd/docker.sock`. `docker context ls` shows `rancher-desktop *` as active, and
the `docker` CLI honours that context — but **testcontainers does not read docker
contexts**. It probes `/var/run/docker.sock` (absent on this machine) and
`$DOCKER_HOST` (unset), finds neither, and reports it as a missing *runtime* — so
the message reads "Docker isn't running" when Docker is running fine and only the
socket path is unknown to the library.

**Fix:** export the active context's endpoint before the integration lane:

```sh
export DOCKER_HOST="unix:///Users/ivan.ramyk/.rd/docker.sock"
pnpm exec vitest run .it.test        # 30 tests, ~15s
```

`TESTCONTAINERS_RYUK_DISABLED=true` was also set; not proven necessary. Diagnose in
one command — `docker context ls`: if the starred context is not `default`, copy its
DOCKER ENDPOINT into `DOCKER_HOST`.

Why the self-skip (`TESTING.md:49`) does not save you: `dockerAvailable()`
(`server/test/helpers/pg.ts:23-33`) shells out to `docker info`, and the **CLI does
honour the active context** — so the guard sees Docker, returns true, and lets the
suite run straight into a library that cannot find the socket. The two disagree by
design, which is why this surfaces as 6 hard failures instead of 30 clean skips.

### 2026-08-05 — "Postgres healthy" then ECONNREFUSED: a container with no published ports

**Symptom:** `./scripts/dev.sh` printed `▸ Postgres healthy` and then died in
`pnpm db:migrate`:

```
✗ migration failed: AggregateError [ECONNREFUSED]
  Error: connect ECONNREFUSED ::1:5432
  Error: connect ECONNREFUSED 127.0.0.1:5432
    at runMigrations (server/src/db/migrate.ts:23:11)
```

**Cause:** the long-lived `devdigest-postgres` container had been created without
its port mapping — `docker inspect -f '{{json .NetworkSettings.Ports}}'` returned
`{}`, no `5432:5432`, despite correct compose labels for this project. The compose
healthcheck is `pg_isready` run *inside* the container, so it reports healthy
whether or not the port is published; `dev.sh` reuses a container on
`.State.Status` + `.State.Health.Status` alone (`scripts/dev.sh:53,62`) and never
checks reachability from the host. So the script vouched for a Postgres that no
host client could reach, and the failure surfaced one step later naming the
*client* (postgres.js), which makes the container look exonerated.

**Fix:** `docker compose up -d` — it detects the config drift and recreates the
container, restoring `0.0.0.0:5432->5432/tcp`. Safe for data: it lives in the
`devdigest_pgdata` named volume, so recreating the container preserves it (40
tables and the seeded rows verified identical before and after). Never reach for
`docker compose down -v` here. To tell this apart from a genuinely-down Postgres in
one command, read the Ports column: `docker ps --filter name=devdigest-postgres
--format '{{.Status}}\t{{.Ports}}'` — empty Ports on an `Up (healthy)` row is this
bug. Same misdirection shape as the 2026-08-03 pnpm entry below: the `▸ applying
migrations` label is where unrelated boot failures land, so distrust it as a
diagnosis.

### 2026-08-03 — pnpm 11 blocks the stack, and blames migrations

**Symptom:** `./scripts/dev.sh` died right after `▸ applying migrations` with a
pnpm stack trace:

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: cpu-features@0.0.10,
esbuild@0.18.20, …, protobufjs@7.6.2, ssh2@1.17.0
[ERROR] Command failed with exit code 1: pnpm install
```

**Cause:** two things stacked. pnpm ≥11 (11.20.0 here) refuses to install until
every dependency with a build script is explicitly allowed or denied in
`pnpm-workspace.yaml`, and pnpm had scaffolded both files with literal
placeholders (`esbuild: set this to true or false`). Separately, `pnpm db:migrate`
runs an implicit deps check *before* the script — so an install-time failure
surfaced under the "applying migrations" label and looked like a DB problem.

**Fix:** real values in `server/pnpm-workspace.yaml` and
`client/pnpm-workspace.yaml`. Allowed: `esbuild` (tsx/vitest/drizzle-kit/Next all
need its native binary), `protobufjs`, `sharp` (next/image). Denied:
`cpu-features` and `ssh2` — optional native speedups for testcontainers' ssh
transport whose JS fallbacks work fine.

→ promoted to CLAUDE.md

## Session Notes

<!-- dated one-liners: what a session changed, and what it cost to find out -->

_None yet._

## Open Questions

<!-- unresolved, each with what would settle it -->

_None yet._
