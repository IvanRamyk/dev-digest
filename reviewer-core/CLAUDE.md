# reviewer-core — the review engine

The pipeline diagram and public API live in `README.md`. Read `INSIGHTS.md` before
starting work here — dated history, not rules; this file wins on any conflict.

## Hard invariants

Breaking any of these breaks the CI runner, which shares this engine with the studio.

1. **Zero I/O.** No DB, GitHub, filesystem, or `process.env`. The only side effect
   is the injected `LLMProvider`. Skills, memory, and specs arrive as **resolved
   strings** — the caller does every lookup.
2. **The package never emits JS.** `build` is `tsc --noEmit`; consumers import the
   raw TypeScript through a path alias.
3. **Verdict, score, and blocker count are derived from finding severities**, never
   taken from the model's self-report, and must stay consistent with each other.
4. **Grounding is mandatory and shared** — one gate after the reduce step, not a
   per-strategy copy.
5. **Prompt-injection defense is the single `INJECTION_GUARD` plus `<untrusted>`
   wrapping.** Do not add keyword scanning of untrusted text: a denylist only ever
   catches one phrasing, in one language.

## Gotchas

- **This package uses npm** (`package-lock.json`), not pnpm. `scripts/dev.sh`
  installs it separately — without its deps the API crashes at boot with
  `ERR_MODULE_NOT_FOUND`.
- **`@devdigest/shared` resolves to `../server/src/vendor/shared/`** (see
  `tsconfig.json`), so this package depends on files *inside* server. Check that
  alias before moving anything.
- **No pricing table here.** Cost estimation is injected via `estimateCost`; the
  server passes its `PriceBook`, the CI runner passes nothing.
