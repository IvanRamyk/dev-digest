# Routing — which reviewer sees which file

Only **four** of this repo's 13 skills are audit-shaped: they carry a violation
catalog, cited rule ids, and an explicit audit mode. Those four are the reviewers.
The other nine are how-to references — no catalog, no severity model — so they load as
*context* for a matched reviewer and never emit findings of their own.

## Reviewers

| Reviewer | Fires on | Rule ids | Native severity |
|---|---|---|---|
| `client-architecture` | `client/src/**/*.{ts,tsx}` | `C1`–`C16` | none — "hard rules" |
| `react-best-practices` | `client/src/**/*.tsx`, `client/src/**/hooks/**`, `client/src/lib/hooks/**` | section names | `CRITICAL`/`HIGH`/`MEDIUM` |
| `onion-architecture` | `server/src/**`, `reviewer-core/src/**` | `O1`–`O9` | none — "hard rules" |
| `security` | see trigger list below | OWASP `A01`–`A10` | `CRITICAL`/`HIGH`/`MEDIUM`/`LOW` + confidence gate |

## Dispatch table

| Changed path | Reviewers | Reference skills loaded as context |
|---|---|---|
| `client/src/app/**` | `client-architecture`, `react-best-practices` | `next-best-practices` (App Router, RSC boundaries, `"use client"`) |
| `client/src/components/**` | `client-architecture`, `react-best-practices` | — |
| `client/src/lib/hooks/**` | `client-architecture` (`C14`, `C15`, `C16`), `react-best-practices` | — |
| `client/src/lib/domain/**` | `client-architecture` (`C11`, `C12`) | `zod` if schemas appear |
| `client/src/lib/**` (other) | `client-architecture` | `zod` where `z.` appears |
| `client/**/*.test.tsx` | `client-architecture` (`C4` — the test is a required segment) | `react-testing-library` |
| `client/messages/en/*.json` | `client-architecture` — **`C10` only** (no user-visible string in `constants.ts`) | — |
| `server/src/modules/*/routes.ts` | `onion-architecture` (`O5`, `O6`, `O8`), `security` | `fastify-best-practices` |
| `server/src/modules/*/service.ts` | `onion-architecture` (`O4`, `O2`, `O9`) | — |
| `server/src/modules/*/repository.ts` | `onion-architecture` (`O6`, `O7`) | `drizzle-orm-patterns` |
| `server/src/db/**` (not `migrations/`) | `onion-architecture` | `drizzle-orm-patterns`, `postgresql-table-design` |
| `server/src/adapters/**`, `server/src/platform/**` | `onion-architecture` (`O2`, `O3`) | — |
| `reviewer-core/src/**` | `onion-architecture` — **`O1` is the whole point here** | — |
| `e2e/**`, `docs/**`, `specs/**`, `scripts/**`, `*.md`, `*.json` config | **none** — log the skip | — |

## `security` trigger list

`security` is path-agnostic — it fires on *what the code does*, not where it lives.
Dispatch it when the diff touches any of:

- `server/src/modules/*/routes.ts` — any new or changed endpoint
- anything matching `auth`, `token`, `session`, `secret`, `key`, `credential`
- `server/src/modules/settings/**` — this is where API keys are handled
- `client/src/lib/api.ts` — the single network path
- file upload, path construction from input, shell invocation, `child_process`
- `SecretsProvider` usage, or anything reading `~/.devdigest/secrets.json`
- SQL built by string concatenation anywhere

### `security` needs a stack correction in its prompt

It is the one reviewer whose assumptions are wrong for this repo, and unlike
`react-best-practices` it carries **no repo-override section**. Its examples are
React + Express + MongoDB + JWT; this stack is **Fastify 5 + Postgres 16/Drizzle +
Zod**, with no JWT and no Mongo. Tell it explicitly to:

- translate `A01`–`A10` onto the real stack — Drizzle parameterization instead of
  Mongoose, Fastify hooks instead of Express middleware, Zod contracts at the edge
  instead of `express-validator`
- **not** report the absence of a Mongo/Express/JWT idiom as a finding
- keep its own confidence gate: report at HIGH confidence only, note MEDIUM, and do
  not report LOW (`security/SKILL.md:16-20`)
- respect its own **Do NOT flag** list — test files, dead code, server-controlled
  values like env vars and config constants
- know that API keys live in `~/.devdigest/secrets.json` at mode `0600`, read only
  through `SecretsProvider` — **never in the DB or git**. A key reaching the DB, a
  log, or a response body is a real CRITICAL here.

## Repo facts every reviewer prompt should carry

Cheap to include, and each one prevents a predictable false positive:

- **Four standalone packages, not a workspace.** Cross-package imports go through
  tsconfig path aliases and consumers import raw `.ts`. An import that looks
  unresolvable is usually an alias, not a bug.
- **`server/src/vendor/shared/` is the one source of truth** for Zod contracts;
  `client/src/vendor/shared/` is a hand-synced copy that has already drifted. Do not
  file "these two files disagree" as a finding of this diff — that is a standing,
  documented condition.
- **~35 DB tables, roughly two thirds empty placeholders** for later lessons. An empty
  table is not a bug; check `server/docs/db-model.md`.
- **Migrations do not run on boot** — that is by design, not a missing step.
- The client is **presentation only**; all I/O and all state live in the server.

## Skipped-reviewer reporting

Name every reviewer that did *not* fire and why, one line each:

```
client-architecture   — no client/src files changed
react-best-practices  — no .tsx or hook files changed
security              — no route, auth, secret, or api.ts file changed
```

Silence reads as "nothing applied." An explicit skip line reads as "checked, did not
apply" — and is the first thing to look at when a verdict surprises someone.
