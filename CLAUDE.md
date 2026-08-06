# DevDigest — local-first AI pull-request review studio

## Stack

Node ≥22 · **pnpm** ≥10 (server, client) · **npm** (reviewer-core, e2e) · Docker (Postgres only)
Fastify 5 · Next.js 15 / React 19 · Drizzle + Postgres 16 (pgvector) · Zod · vitest

## Layout — 4 standalone packages, NOT a workspace

| Dir | Package | Role | Port |
|-----|---------|------|------|
| `server/` | `@devdigest/api` | Fastify API — all I/O and all state | 3001 |
| `client/` | `@devdigest/web` | Next.js studio (presentation only) | 3000 |
| `reviewer-core/` | `@devdigest/reviewer-core` | pure review engine, zero I/O | — |
| `e2e/` | `@devdigest/e2e` | deterministic browser flows | — |

Each package has its own `package.json` **and** lockfile. Cross-package code is
shared through tsconfig path aliases — consumers import **raw `.ts`**; nothing is
published, and `reviewer-core` never emits JS.

## Commands

- Whole stack from zero: `./scripts/dev.sh` (`--no-seed` · `--no-client` · `--db-only`)
- `server/`: `pnpm dev` · `pnpm db:migrate` · `pnpm db:seed` · `pnpm test` · `pnpm typecheck`
- `client/`: `pnpm dev` · `pnpm test` · `pnpm typecheck`
- e2e against an isolated stack: `./scripts/e2e.sh`

## Read when

- Starting work in a package → read that package's `INSIGHTS.md` first (dated history,
  not rules — `CLAUDE.md` wins on any conflict)
- Adding or changing a route, module, or DB table → read `server/README.md` and `server/CLAUDE.md`
- Touching the review pipeline, prompt, grounding, or scoring → read `reviewer-core/README.md`
- Writing or moving a test → read `TESTING.md`; the `*.it.test.ts` split is enforced
- You need the end-to-end data flow or the DB model → read `docs/architecture.md`
- Editing an agent's system prompt → read `docs/agent-prompts/README.md`
- Implementing a lesson feature → read the matching file in `specs/`

## Gotchas

- **Migrations do NOT run on boot.** `relation ... does not exist` → `cd server && pnpm db:migrate`.
- **pnpm ≥11 refuses to install** until every dependency with a build script is
  allowed in `<pkg>/pnpm-workspace.yaml`. The failure surfaces under whatever
  command triggered the implicit deps check (e.g. `db:migrate`), not at install time.
- **Seeded agents default to provider `openrouter`**, so a first review needs
  `OPENROUTER_API_KEY` — not the OPENAI/ANTHROPIC keys the README suggests.
- **`server/src/vendor/shared/` is the ONE source of truth** for Zod contracts.
  `client/src/vendor/shared/` is a hand-synced copy that has already drifted:
  editing one does not propagate, and TypeScript will not complain.
- API keys live in `~/.devdigest/secrets.json` (mode `0600`) — never in the DB or git.
  Read them only through `SecretsProvider`.
- The DB has ~35 tables and roughly two thirds are **empty placeholders** for later
  lessons. An empty table is not a bug — check `server/docs/db-model.md` first.

## Do not touch

- `server/src/db/migrations/*` — never edit an applied migration; add a new one.
- `*/vendor/shared/`, `client/src/vendor/ui/` — vendored; change the upstream source.
- `INSIGHTS.md` (`server/` · `client/` · `reviewer-core/` · `e2e/`) — append only, never
  rewrite or reorder history. The one permitted edit to an existing entry is appending
  `→ promoted to CLAUDE.md`. Write through the `engineering-insights` skill.
