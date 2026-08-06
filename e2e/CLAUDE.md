# e2e — browser flows

The spec format, env knobs, and per-flow coverage table live in `README.md`. Read
`INSIGHTS.md` before starting work here — dated history, not rules; this file wins on
any conflict.

## Rules

- Specs are `specs/NN-name.flow.json`, run in **lexical filename order**. In this
  package "spec" always means a browser flow — there is no second meaning.
- Flows are **read-only against seeded data**: no LLM call, no API key, no mutations.
- **A non-zero exit from any agent-browser command fails the step and the flow.**
  That is what makes `wait --text` / `wait --url` the assertions — they time out
  and exit non-zero when the condition never holds.
- Assert the thinnest thing that proves the wiring; data specifics belong in the
  flow that owns them.
- Locators stay deterministic (`--url`, `--text`, `find role|text|label`). Never
  use the AI `chat` command.

## Gotchas

- **The driver is Vercel agent-browser (a Rust/CDP CLI), not Playwright.** There is
  no test framework here — `run.ts` plus the JSON convention *is* the harness.
- **`../scripts/e2e.sh` is a local convenience**, spinning up an isolated stack on
  alternate ports (Postgres 5433 / API 3101 / web 3100) with an ephemeral DB. CI
  does not use it: `e2e-web.yml` brings up its own stack and calls `npm test`.
- Flows 02/04/05 follow the home redirect to the **first** repo, so they need a
  freshly-seeded DB where the demo repo is the only one. Running against your dev
  DB usually fails for that reason — use the hermetic runner.
- Never `docker compose down -v` to "reset" the dev DB: `-v` deletes the
  `devdigest_pgdata` volume and every repo and review you imported.
