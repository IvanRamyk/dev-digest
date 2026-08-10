# client — `@devdigest/web`

Route map, stack, and the API surface each page leans on live in `README.md`.

## Conventions

- **Colocation.** One component = one folder: `Component.tsx` + `index.ts` +
  `styles.ts` + `constants.ts` + `helpers.ts` + `*.test.tsx`. Route-private
  components live in `_components/` next to the route that uses them.
- Pages (`page.tsx`) stay thin; feature logic lives in the colocated `_components/`.
- `src/components/` is DevDigest-specific. `src/vendor/ui/` is the vendored design
  system (`@devdigest/ui`) — consume it, do not extend it here.
- The server is the source of truth; the client only caches it (TanStack Query).
- All network access goes through `src/lib/api.ts`; every data hook lives in
  `src/lib/hooks/*`.
- Query keys live in `src/lib/query-keys.ts`, and a mutation invalidates everything it
  touches. Components never write a key literal or call `invalidateQueries`.

## Read when

- Starting work here → read `INSIGHTS.md` first (dated history, not rules — this file
  wins on any conflict)
- Adding or moving a component, page, hook, constant, style, helper, or query key →
  read `.claude/skills/client-architecture/SKILL.md` (tiers, segments, promotion rules)
- Writing a component test → read `../TESTING.md` (vitest + jsdom, `fetch` mocked;
  no API and no browser needed)
- Adding a real browser journey → read `../e2e/CLAUDE.md`

## Gotchas

- **`src/vendor/shared/` is a stale copy** of the server's Zod contracts — it is
  missing `'openrouter'` on `LLMProvider.id`, plus `sessionId` and `commitFiles`.
  Fix `server/src/vendor/shared/` first, then re-sync by hand; TypeScript will not
  flag the divergence.
- **Polls must self-quench.** `refetchInterval` is a function that returns `false`
  when nothing is running (see `usePrRuns`). A constant interval polls forever.
- **SSE `kind: "error"` events bypass the global error toast** — they are neither a
  rejected mutation nor a query error, so surface them explicitly (`useRunEvents`).
- `EventSource` delivers events both as `onmessage` and as named `event:` listeners
  depending on the client; subscribe to both or you will drop events.
