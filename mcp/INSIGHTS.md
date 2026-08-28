# mcp — INSIGHTS

Dated, append-only history for the `@devdigest/mcp` package. Not rules — the
package/root `CLAUDE.md` wins on any conflict. Newest-first within each section.
Append only; never rewrite, reorder, or reflow an existing entry.

## What Doesn't Work

_None yet._

## Recurring Errors & Fixes

_None yet._

## Tool & Library Notes

- 2026-08-23 — Vitest (Vite) does not read tsconfig `paths`, so importing a VALUE
  from `@devdigest/shared` (e.g. `Severity` in `src/tools/_shared.ts`) fails at test
  load with "Failed to load url @devdigest/shared … Does the file exist?" even though
  `tsc` passes → mirror the alias in `mcp/vitest.config.ts`
  (`resolve.alias['@devdigest/shared'] = ../server/src/vendor/shared`), exactly as
  `reviewer-core/vitest.config.ts` does. Type-only imports erase and hide the gap; the
  first runtime value import surfaces it (mcp/vitest.config.ts:10).
- 2026-08-23 — the `@modelcontextprotocol/sdk` `registerTool` callback return type is
  the SDK's `CallToolResult`, which has an index signature (`[x:string]: unknown`) and a
  union `content` type; a hand-rolled `{ content: {type,text}[] }` interface is NOT
  assignable and fails with "Index signature for type 'string' is missing" → alias the
  tool-result type to `CallToolResult` from `@modelcontextprotocol/sdk/types.js` rather
  than redeclaring it (mcp/src/tools/_shared.ts:1).

## Codebase Patterns

- 2026-08-23 — `GET /repos/:id/conventions` returns `{ scan, candidates }` (not a bare
  array) and its `status` query is the `ScanStatusFilter` enum
  `pending|accepted|rejected|all` — there is no server-side "accepted-only" shortcut, so
  the client passes `accepted` and reads `candidates` → treat a null `scan` as
  "never scanned" and refuse to POST a scan
  (server/src/modules/conventions/service.ts:84).

## What Works

_None yet._

## Open Questions

_None yet._

## Session Notes

_None yet._
