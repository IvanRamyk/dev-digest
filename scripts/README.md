# scripts

Two bash entry points. Both are idempotent and safe to re-run.

## `dev.sh` — bring the whole stack up from zero

```sh
./scripts/dev.sh                # Postgres → env files → deps → migrate → seed → API + web
./scripts/dev.sh --no-seed      # skip the demo seed
./scripts/dev.sh --no-client    # Postgres + API only
./scripts/dev.sh --db-only      # Postgres + migrate + seed, then exit
./scripts/dev.sh --help
```

Ctrl-C stops the dev servers and **leaves Postgres running** (`docker compose down`
to stop it). Order and rationale:

1. Reuses an already-running `devdigest-postgres` container instead of failing on the
   name conflict, starts it if stopped, else `docker compose up -d`.
2. Copies `.env.example` → `.env` in `server/` and `client/` when missing.
3. Installs deps only where `node_modules` is absent — pnpm for `server`/`client`,
   **`npm ci` for `reviewer-core`**, whose raw source the API imports at runtime.
   Without it the API crashes at boot with `ERR_MODULE_NOT_FOUND`.
4. `pnpm db:migrate`, then `pnpm db:seed` unless `--no-seed`.
5. API on `:3001`, web on `:3000`.

## `e2e.sh` — hermetic browser e2e

```sh
./scripts/e2e.sh
E2E_PG_PORT=5440 E2E_API_PORT=3201 E2E_WEB_PORT=3200 ./scripts/e2e.sh
```

Boots a **fully isolated stack on alternate ports** (Postgres 5433, API 3101, web
3100) with an ephemeral container (`--rm`, no named volume), migrates and seeds it,
runs the flows in [`../e2e`](../e2e/README.md), then tears everything down — on
success, failure, or Ctrl-C.

Why isolation matters: flows 02/04/05 follow the home redirect to the *first* repo,
so they need a DB where the seeded demo repo is the only one. Running against your
dev DB usually fails for that reason, and it is safe to run this while your normal
dev stack is up.

Env is exported **before** any tsx/next spawn, because dotenv does not override
already-set variables — that is how the alt ports win over `server/.env` without
editing the file. `WEB_PORT` must be exported too: the API derives its CORS
allow-origin from it.

Teardown walks the process tree leaves-first (`kill_tree`), because `pnpm exec tsx`
and `next dev` spawn the real listener as a *grandchild* — a plain `kill` leaves the
port bound. A port-based backstop then reaps anything still listening, restricted to
the isolated ports so the dev stack on 3000/3001 is never touched.

**This script is a local convenience.** CI does not use it: `e2e-web.yml` brings up
its own stack and calls the pure runner (`cd e2e && npm test`) directly.

## Gotchas

- Never `docker compose down -v` to "reset" the dev DB. `-v` deletes the
  `devdigest_pgdata` volume along with every repo and review you imported. The e2e
  container is ephemeral by design; the dev one is not.
- `e2e.sh` hard-guards migrate/seed against a non-isolated `DATABASE_URL`, so it
  cannot accidentally seed over your dev database.
