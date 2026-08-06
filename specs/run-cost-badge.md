# Run Cost Badge

Show what one agent review run cost, in the three places a reviewer already looks.

## Context

The studio runs LLM reviews and already tracks tokens per run, but the dollar figure
is invisible. Without it there is no feedback loop between "I picked a bigger model"
and "this is what it costs", so model choice stays a guess.

Every piece of the computation already exists — the engine sums a per-run cost and
the server owns two price sources. Only the last mile is missing: the value is
computed and then dropped on the floor in `run-executor.ts` before it reaches the DB.

Scope is deliberately narrow: **display the cost of a run**. Budgets, alerts,
spend caps, and per-agent / per-model aggregates are out — those belong to later
lessons, and their contracts (`observability.ts`, `productionize.ts`) already
reserve fields for them.

## Decision

### Source of truth

One chain, already implemented in `reviewer-core/src/llm/openrouter.ts:107`:

```
OpenRouter usage.cost        → the real generation cost, billed
  ?? PriceBook.estimate(...) → live OpenRouter prices (6h TTL), else the static table
  ?? null                    → unknown model
```

The native `usage.cost` wins because it is the number OpenRouter actually bills,
so the badge reconciles with their dashboard by construction rather than by our
arithmetic matching theirs. `usage: { include: true }` is already sent, so this
costs **zero extra model calls** — the cost rides along in the response we already
make.

For OpenAI and Anthropic (no native cost field) `estimateCost` computes
tokens × price from the static USD-per-1M table.

### `null` is not `0`

Two distinct states that must never be conflated:

| Value | Meaning | Renders |
|---|---|---|
| `null` | no data — unknown model, run failed, cancelled, or never ran | `—` |
| `0` | real data — a free model (e.g. `z-ai/glm-4.7-flash`) | `$0` |

A failed run must never render `$0.00`: that reads as "this was free" when the
truth is "we don't know". Every failure path writes `null`, not `0`.

### Null-poisoning on map-reduce is intentional

In the map-reduce path the engine sums per-chunk costs, and one chunk with an
unknown price nulls the whole run (`reviewer-core/src/review/run.ts:184`):

```ts
costUsd = costUsd == null || res.costUsd == null ? null : costUsd + res.costUsd;
```

Kept as-is. A partial sum silently understates spend, which is worse than an
honest `—`, because an understated number still gets trusted.

### Format

At least 3 significant figures: `$0.012`, never `$0.01`. Run costs live in the
$0.001–$0.05 range, so 2 decimal places collapse most of them to `$0.00` and
destroy exactly the signal we are adding. This is why the previously-deleted
`formatCost` (`toFixed(2)`) cannot be restored as it was.

### Where it shows

| Surface | Shape |
|---|---|
| PR list, `COST` column | `$0.014` — **total** for the PR: the sum of each agent's latest priced run |
| PR detail → Agent runs → timeline row | `9,119 tok · $0.0013` — that one run |
| Run trace drawer → Stats | a `COST` tile between `TOKENS` and `FINDINGS` — that one run |

The two scopes are deliberate. A timeline row and a trace are *about* one run, so
they show that run. The list has one row per PR and answers a different question —
"what did this PR cost me" — and reviewing with three agents costs three runs, so a
single run's cost understates it by 3-5×.

**Total = the sum of each agent's latest run**, not the sum of all runs:

- Re-running one agent **supersedes** its own earlier attempt instead of adding to
  the total, so the number keeps describing the current state of the review rather
  than growing monotonically with every experiment.
- An agent whose **latest** run has no price contributes nothing, and does **not**
  fall through to that agent's older priced run. Revised 2026-08-06: the original
  ruling here was the opposite — fall through so a failed run "does not blank the
  column" — but a superseded run describes a review that no longer exists, so
  resurrecting its figure makes the total a mix of the current attempt and an
  abandoned one. The same defect was found in `findings_by_severity` and both
  columns now share this rule (`specs/findings-by-severity.md`).

  Consequence worth stating: unpriced runs are therefore **not** filtered out in
  SQL. The failed newest row has to be visible to the per-agent dedup so it can
  win the slot and suppress its own predecessor
  (`server/src/modules/pulls/routes.ts`).

Why not group by "the last batch of agents": `agent_runs` has no batch column.
`POST /pulls/:id/review {all:true}` creates one independent row per agent
(`server/src/modules/reviews/service.ts:119`) with nothing tying them together, so
"the last run of all agents" is not a thing the data can express. Per-agent latest
is the closest honest approximation, and it survives the common case of re-running
a single agent after a batch. Adding a real `batch_id` is the alternative if
per-batch attribution is ever needed — it would be a schema change, and every
existing run would have a null batch.

One known gap: a deleted agent leaves `agent_id` NULL (`ON DELETE SET NULL`), and
orphaned runs are indistinguishable from one another, so they collapse into a single
bucket. That undercounts a batch whose agents were all deleted, and never
double-counts one agent's retries — the safer direction of the two.

## Consequences

- `agent_runs` regains a `cost_usd` column (migration `0010`); `0009` dropped it.
- `RunStats`, `RunSummary`, and `PrMeta` each gain a nullable `cost_usd`, following
  the naming already used by `eval-ci.ts` and `observability.ts`.
- The PR-list route runs one extra `IN` query per page load, alongside the score
  query it already runs. The list is small and both are cheap.
- Cost is stored, not derived on read. A price change does not retroactively rewrite
  a past run's cost — the number is what that run cost when it ran, which is what
  makes it reconcilable against the provider's dashboard.
- Runs created before this change keep `cost_usd = NULL` and render `—`. No backfill:
  their token counts survive, but the price at the time does not.

## Acceptance criteria

1. Every completed run shows its cost in all three surfaces.
2. A run with no data — unfinished, failed, or cancelled — shows `—`, never `$0.00`.
3. A free model shows `$0` (data, not absence of data).
4. The figure matches the run's own trace (`GET /runs/:id/trace` → `stats.cost_usd`)
   and the OpenRouter dashboard for that generation. Verify on one real run.
5. Zero additional model calls: cost comes only from the `usage` already returned.
