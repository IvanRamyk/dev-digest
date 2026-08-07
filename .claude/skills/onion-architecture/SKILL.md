---
name: onion-architecture
description: Enforces Onion Architecture in this repo's backend packages — dependencies point inward only, every external call sits behind a port declared in vendor/shared/adapters.ts, and reviewer-core stays free of I/O. Use when adding or changing a server module, service, repository, route, adapter, or port; when placing a new external dependency; when a service reaches for drizzle, fastify, node:fs, or process.env; and when the user asks to audit or review backend layering. It does not cover Fastify route mechanics (use fastify-best-practices), Drizzle query syntax (use drizzle-orm-patterns), or Zod schema authoring (use zod).
version: 1.0.0
user-invocable: true
---

# Onion architecture — inward-only dependencies for the backend

Applies to `server/` and `reviewer-core/`. The rules restate and sharpen
`server/CLAUDE.md` **Layer discipline** and `reviewer-core/CLAUDE.md` **Hard
invariants** — those two files are authoritative and win on any conflict.
Sources for every rule: [README.md](README.md).

## The rings

Five rings, mapped to real paths — "the domain layer" here means a directory you can
`cd` into.

| Ring | Lives in | May import |
|---|---|---|
| 0 · core | `reviewer-core/src/` | `@devdigest/shared` types, `zod`. Nothing else. |
| 1 · ports & contracts | `server/src/vendor/shared/` — `adapters.ts`, `contracts/` | `zod` only |
| 2 · application | `modules/*/service.ts` · `modules/*/helpers.ts` | rings 0–1, its own `repository.ts`, `container.<port>` |
| 3 · infrastructure | `adapters/*` · `db/*` · `modules/*/repository.ts` · `platform/*` | rings 0–1 |
| 4 · entry points | `modules/*/routes.ts` · `app.ts` · `server.ts` · `platform/container.ts` | anything |

**Coupling points inward, always.** Ring 1 is the pivot: inner rings *declare* the
interfaces, outer rings *implement* them, so control can flow outward while source
dependencies still point in. Ring 4 is the only place allowed to know concrete
classes — `platform/container.ts` is the single composition root, and no other module
may take the container apart to reach an implementation.

**Any outer ring may call any inner ring directly.** You do not tunnel through
adjacent layers: a route may use a ring-1 contract without a service inventing a
passthrough. Skipping a ring inward is fine; pointing outward never is.

## Hard rules

Cited by id in audit findings.

**O1 — the core stays pure.** No `node:fs`, `drizzle-orm`, `fastify`, `process.env`,
or network client anywhere in `reviewer-core/src/`. Side effects arrive injected:
`llm`, `onEvent`, `checkCancelled`, `estimateCost`. Skills, memory, and specs arrive
as **resolved strings** — the caller does every lookup.

**O2 — ports are declared inward, and shaped by the caller.** A new external
dependency that performs **I/O** gets an `interface` in `vendor/shared/adapters.ts`
*before* it gets an implementation, and the interface is shaped by what our code
needs — not copied from the vendor SDK's surface. Implementation goes in
`adapters/<name>/`. `adapters/depgraph` and `adapters/tokenizer` colocate their port
with their impl: tolerated, not the pattern to copy.

A vendor library used as a **pure function** needs no port. `adapters/astgrep`
exports `(file, source) => data` parsers that touch nothing — `test/astgrep.test.ts`
calls them directly with string fixtures. Wrapping those in an injectable interface
buys no seam, because there is no I/O to fake. Ask what the double would replace: if
the answer is "the same computation, slower to write", it is not a port.

**O3 — every port gets a double and an override.** Add a `ContainerOverrides` field
in `platform/container.ts` and a mock in `adapters/mocks.ts`
(`MockLLMProvider`, `MockGitClient`, … are the models). A port with no double is a
port no test can cross, and the failure mode is a test that reaches into a private
field with an `as never` cast instead. If you cannot name the fake, the interface is
wrong.

**O4 — `service.ts` holds no HTTP and no SQL.** No `fastify` import, no `drizzle-orm`
import, no `node:fs`, no vendor SDK. Persistence goes through `repository.ts`; the
outside world through `container.<port>`. A service must not know whether it was
called by a route, a job, or the CI runner.

**O5 — `routes.ts` is transport only.** `getContext(container, req)` → one service
call → status code. No `drizzle-orm`, no direct adapter call, no business rule, no
aggregate reduction. `modules/repos/routes.ts` is the reference: 48 lines, four
routes, zero logic.

**O6 — `repository.ts` is a module's only drizzle site.** It takes `Db`, returns row
types or DTOs, and never hands a query builder outward. Class-based
(`repos`, `agents`) and facade-over-functions (`reviews/repository.ts` →
`repository/*.repo.ts`) are both accepted; mixing styles inside one module is not.

**O7 — modules do not import each other's data layer.** Type-only needs go through
`db/rows.ts`. A genuinely shared repository is constructed in the composition root
and read as `container.agentsRepo` — never by importing a sibling's folder.

**O8 — parse once, at the edge.** Zod contracts are Fastify schemas via the type
provider; inward code receives already-typed values and does not re-parse. Validation
scattered through processing code is the smell. Do **not** derive an HTTP contract
from `drizzle-zod` — that welds the wire format to the table, and ring 1 must not
know the schema exists.

**O9 — transactions are a use-case concern.** A multi-write invariant opens
`db.transaction` in the service and threads the handle down; repository functions
take the handle as a parameter and never close over module-level `db`, or the write
escapes the transaction. Note: there are no transactions in the codebase today, so
this rule governs new code — do not "restore" a pattern that was never there.

## The service shape

Impure → pure → impure. Load what the decision needs, decide in a pure function,
then persist and emit.

`modules/reviews/run-executor.ts:188-214` is the in-repo exemplar, with the boundary
stated in a comment at the call site: repo-intel context resolution above,
`reviewPullRequest()` in the middle, persistence and observability below.

If a decision needs data, **fetch the data and pass the value inward.** Passing an
I/O function into the core is not purity — it just moves the dependency behind a
parameter. `checkCancelled` and `onEvent` are the sanctioned exceptions: they are
callback ports for cancellation and observability, not data access.

## When not to add a layer

Layering that is not paying for itself is the failure mode this section exists to
prevent. Onion architecture suits long-lived code with real business rules; it does
not suit every file in the repo.

- **Don't add an interface you would not want to mock.** Mock I/O; never mock domain
  logic. One implementation and no test double means you wrote a type alias with
  extra steps.
- **Five rings is the ceiling.** More is a smell, and the rings are concepts before
  they are directories.
- **A read-only path may skip repository ceremony.** Better a named query function
  than a repository growing `findXWithAWithB(...)` variants — that is just the
  persistence API rebuilt by hand, one method at a time.
- **A service that only forwards to a repository is a tax, not a layer.** Delete it —
  but do not then let `routes.ts` grow the logic instead.
- **Watch for an anemic core.** If every rule migrated into services while
  `reviewer-core` and `helpers.ts` hold only data shapes, you are paying the full
  cost of a domain model and collecting none of the return.
- **Purity, completeness, performance — pick two.** Prefer purity and let the use
  case do the lookup: fragmented domain logic is a lesser evil than a domain that
  talks to Postgres.
- **If the architecture is slowing the work down, say so** rather than routing around
  it. Excessive devotion to simplicity is the same error mirrored.

## Audit mode

1. **Read the authoritative rules** — `server/CLAUDE.md` **Layer discipline** and
   `reviewer-core/CLAUDE.md` **Hard invariants**. If either file is missing, stop and
   report; do not audit from this file alone.
2. **Scope.** Branch mode: `git diff main...HEAD --name-only` (or
   `git diff --name-only HEAD` for uncommitted work). Module mode: the named
   directory, current state.
3. **Classify** each file into a ring by path, using the table above.
4. **Check O1–O9.** In branch mode, check **changed lines only** — a pre-existing
   violation in an untouched line is out of scope and is not a finding. In module
   mode, everything in scope counts.
5. **Report** one block per finding, most severe first:

   ```
   [O4] service.ts holds no SQL
   File:  server/src/modules/foo/service.ts:42
   Issue: imports `eq` from drizzle-orm and queries `foo` directly
   Fix:   move the query into modules/foo/repository.ts, call it from the service
   Why:   server/CLAUDE.md — "service.ts holds no HTTP and no raw SQL"
   ```

6. **A clean diff gets one line saying so.** Zero findings is a correct outcome —
   do not manufacture a finding to look thorough.

Useful checks: `rg "from 'drizzle-orm'" server/src/modules/*/routes.ts` ·
`rg "node:fs|from 'fastify'" server/src/modules/*/service.ts` ·
`rg "node:fs|drizzle-orm|process\.env" reviewer-core/src/`.

## Never

- Add an adapter without a port, a `ContainerOverrides` entry, and a mock.
- Import another module's `repository.ts`, or reach into `container` for a concrete
  class outside the composition root.
- Put a query, a GitHub call, or an aggregate reduction in `routes.ts`.
- Give `reviewer-core` an I/O dependency, or resolve a slug inside it.
- Re-parse at an inner ring what a contract already parsed at the edge.
- Report a pre-existing violation as a finding of the diff under audit.
