# Jobs and review runs

Two different mechanisms for background work, with different guarantees. Confusing
them is the most common wrong assumption about this codebase.

## Jobs — `JobRunner`

An in-process `p-queue` (`src/platform/jobs.ts`), `concurrency: 3`, owned by the
`Container` and alive exactly as long as the API process.

| Kind | Constant | Registered in | Enqueued from |
|------|----------|---------------|---------------|
| clone | `CLONE_JOB_KIND` | `modules/repos/service.ts` | `POST /repos`, `POST /repos/:id/refresh` |
| index | `INDEX_JOB_KIND` | `modules/repo-intel/service.ts` | end of the clone job |
| refresh | `REFRESH_JOB_KIND` | same | `POST /repos/:id/refresh` |
| resync | `RESYNC_JOB_KIND` | same | `POST /repos/:id/resync` |

Registration happens once at boot: `repos/routes.ts` and `repo-intel/routes.ts` call
their service's register method as the plugin loads. `enqueue()` throws when no
handler exists for a kind.

Around every handler: `withTimeout(120_000)` and `withRetry` with exponential
backoff (250ms, ×2, capped at 8s, plus jitter), retrying only transient failures —
429, 5xx, `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND` (`platform/resilience.ts`).

### Chaining

```
POST /repos            → CLONE_JOB
  └─ on success        → INDEX_JOB     (enqueued, not called directly)
POST /repos/:id/refresh → CLONE_JOB + REFRESH_JOB
POST /repos/:id/resync  → RESYNC_JOB   (git fetch, then incremental)
```

The clone job **enqueues** indexing rather than calling it, so the clone closes
promptly and the heavier index gets its own timeout and retry budget. Every
follow-up `enqueue` is wrapped in a `try {} catch {}` that swallows: the clone
already succeeded, and a missing follow-up must not fail it. Recovery is manual.

### What to keep in mind when writing a handler

- **Order across kinds is not guaranteed.** `concurrency: 3` is process-wide and
  p-queue does not FIFO between kinds, so a follow-up can overtake its parent.
  Handlers must be order-independent. `runIncremental` is the model here: it is a
  no-op when `currentHead === lastIndexedSha`, so firing before the clone settles
  costs nothing.
- **The `jobs` table is a mirror.** Truth is the in-memory queue; the row exists so
  failures are inspectable. Nothing re-reads it on boot, so `queued`/`running` rows
  survive a restart forever as garbage.
- **A handler cannot catch its own outer timeout.** The indexer therefore self-watches
  `INDEX_SOFT_BUDGET_MS` (110s) below the hard 120s cap, breaks out of the file loop,
  skips the graph/rank stage, and records `status='partial'` honestly. Each file also
  gets a 2s watchdog (`MAX_PARSE_MS_PER_FILE`) so one pathological file cannot burn
  the budget.
- **Bump `INDEXER_VERSION`** (`modules/repo-intel/constants.ts`) when the parser or
  symbol schema changes. `runIncremental` compares it against
  `repo_index_state.indexer_version` and forces a full reindex on mismatch —
  without the bump, rows from two schema versions mix.

## Review runs — not jobs

`POST /pulls/:id/review` does **not** use `JobRunner`. It creates the `agent_runs`
rows, returns their ids immediately, and then fires the work off unqueued:

```ts
void this.executor.executeRuns(...).catch(err => logger?.error(...))
```

So a review has **no queue, no concurrency cap, no timeout, and no retry** — just a
promise that lives as long as the process. Its observability is separate too:
`agent_runs` rows plus the SSE stream, never the `jobs` table.

Consequences that bite in development:

- **Boot fails every in-flight run.** `reapStaleRuns()` runs `await`-ed before the
  server listens and marks *every* `status='running'` row failed, on the assumption
  that a fresh process owns no runs yet. Under `tsx watch`, saving any server file
  restarts the process and therefore kills the review in progress.
- **Cancellation works on orphans too.** `cancelRun` signals the live runner *and*
  updates the DB row *and* completes the bus, so a run whose process already died
  can still be cancelled from the UI.
- **Cancellation is checkpointed, not immediate.** The engine calls `checkCancelled`
  before each chunk's LLM call, so a single-pass review effectively cannot be
  interrupted mid-call.
- **Per-agent failures are isolated**; pre-work failures (diff load) fail every
  queued run via `failAll`, which also persists each run's buffered log.

## The run event bus

`platform/sse.ts` holds an in-memory `RunBus`: `publish()` buffers and emits,
`subscribe()` **replays the buffer first**, then attaches the listener. That replay
is what makes a mid-run page reload show the log from the beginning.

`complete()` emits `done` so the SSE generator can end the response — without it,
`EventSource` would reconnect on its own. A subscriber arriving after completion
still terminates cleanly: `onDone` fires immediately via `queueMicrotask`.

The buffer is RAM only. On completion the full log is persisted into `run_traces` as
one jsonb document, so after a restart the history is read from Postgres and the bus
starts empty.
