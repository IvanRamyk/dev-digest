# MCP Server — DevDigest review tools over stdio

A local [Model Context Protocol](https://modelcontextprotocol.io) server that
lets an MCP client (Claude Desktop, Claude Code, the Inspector) run DevDigest
reviews from inside a conversation. It is a **thin client over the existing
HTTP API** at `http://localhost:3001` — no database, no `server/` imports, no
duplicated business logic. It lives in the 5th standalone package, `mcp/`.

## Context

DevDigest already reviews a PR end to end behind an HTTP API: it lists agents,
imports PRs from GitHub, fires an agent run, and persists the findings. What it
did not have was a way to drive that from an agentic client — the studio is a
browser app, and the CI runner is non-interactive. An MCP server closes that gap:
it turns four HTTP capabilities into four tools an LLM can call by name, with flat
human-friendly arguments (`repo="owner/name"`, `pr=7`, `agent="Security"`) instead
of the opaque ids the routes expect.

Everything the tools need is already exposed:

- `GET /agents` lists the configured agents.
- `POST /repos` + `GET /repos` add and list repos; `GET /repos/:id/pulls` triggers
  a GitHub PR-sync and returns the synced PRs.
- `POST /pulls/:id/review` fires a fire-and-forget agent run; `GET /pulls/:id/runs`
  reports its terminal status; `GET /pulls/:id/reviews` returns the persisted
  findings.
- `GET /repos/:id/conventions?status=…` returns the learned conventions.

The contracts (`Agent`, `Repo`, `PrMeta`, `RunSummary`, `ReviewRunResponse`,
`Finding`, `Severity`, …) are consumed **read-only** from
`server/src/vendor/shared` through a tsconfig path alias — the single source of
truth, imported as raw TypeScript, never copied.

## What we're building

A stdio MCP server (`@modelcontextprotocol/sdk`, `McpServer` +
`StdioServerTransport`) that registers four tools by default and holds exactly one
piece of I/O: a native-`fetch` HTTP client (`src/api/client.ts`) pointed at the
configured base URL. Resolvers (`src/api/resolve.ts`) turn the flat arguments into
ids; shaping helpers (`src/tools/_shared.ts`) trim findings to a concise/detailed
subset, severity-order and cap them, and wrap third-party text as untrusted.

| Tool | Route(s) | Notes |
|---|---|---|
| `devdigest_list_agents` | `GET /agents` | Read-only, no inputs. |
| `devdigest_run_agent_on_pr` | `POST /pulls/:id/review` → poll `GET /pulls/:id/runs` → `GET /pulls/:id/reviews` | Blocks with a timeout fallback. |
| `devdigest_get_findings` | `GET /pulls/:id/reviews` (+ `/runs` cross-check) | By `run_id` (this session) or `repo` + `pr`. |
| `devdigest_get_conventions` | `GET /repos/:id/conventions` | Read-only — never POSTs a scan. |

A fifth, `devdigest_get_blast_radius`, is a written-and-tested **stub** gated
behind `MCP_ENABLE_BLAST_RADIUS`; when enabled it returns a `not_implemented`
result pointing at `devdigest_get_findings`. It is unregistered by default to keep
the `tools/list` payload — which is context-window overhead on every message —
small.

## Decisions

### `run_agent_on_pr` composes start → poll → assemble, because the pipeline is async

`POST /pulls/:id/review` is a bare fire-and-forget promise server-side (no timeout,
no queue — `server/CLAUDE.md`). There is no synchronous run-and-return endpoint, so
the tool starts the run, records the returned `run_id`, then polls
`GET /pulls/:id/runs` every `MCP_POLL_INTERVAL_MS` until the run reaches `done`,
`failed`, or `cancelled`, or until the `MCP_RUN_MAX_WAIT_MS` budget elapses.

A timeout is a **success, not an error**: it returns
`{status:"running", resume_with:"devdigest_get_findings", run_id, repo, pr}`, so the
client can come back for the result instead of treating a slow model as a failure.
A `done` run is assembled from `GET /pulls/:id/reviews` filtered to the `run_id`; a
`done`-but-empty review yields `verdict`/`score` with no findings and a
"reviewed, clean" note — the `{0,0,0}` vs `null` distinction the contracts insist on.

### A missing provider key is only visible by polling, so we read it from the failed run

A review with an unconfigured provider key does not fail synchronously — the
`POST` returns a run id, and the run later flips to `status:"failed"` with an error
like `OPENROUTER_API_KEY is not configured` (the `ConfigError` from
`platform/container.ts`). The poll loop matches that text and emits an actionable
message naming the provider and the Settings path — never a raw 500. Every other
failure surfaces the server's own message; a 429 (the review endpoint is
rate-limited 10/min) becomes a "slow down" hint with no automatic retry.

### Arguments are flat and free-string; validation happens in code, taught by errors

Tool inputs are flat Zod raw shapes — no nested objects. `response_format`,
`severity`, and `status` are `z.string()`, **not** `z.enum()`: an enum balloons the
serialized JSON Schema that ships on every `tools/list`, and the token budget is
the binding constraint. They are validated at runtime against the shared `Severity`
contract (never a local literal) and an invalid value produces an error-forward
message that names the valid set. `outputSchema` is omitted on every tool for the
same reason. A `token-budget.test.ts` pins the serialized default listing under a
ceiling so a careless description can't quietly bloat it.

### Every failure is error-forward, and third-party text is wrapped untrusted

Resolvers throw typed errors whose `.message` already names the next action —
unknown agent lists the available names and points at `devdigest_list_agents`; a
bad `repo` states the `owner/name` shape; a missing PR explains the sync window; an
unreachable API says "start `./scripts/dev.sh`". Findings and conventions are
PR/repo-derived, so they are wrapped in `<untrusted_content source="…">` (mirroring
`reviewer-core`'s `<untrusted>` convention) — the server never keyword-scans them,
because a denylist catches one phrasing in one language and gives false confidence.
API keys are **never** accepted as tool arguments and never logged; the local API
is no-auth, so no token is sent by default.

### stderr-only logging

The stdio transport speaks JSON-RPC over stdout. A single `console.log` corrupts
the stream and breaks every client, so all diagnostics go to `console.error`. This
is enforced by grep in the hardening step and by convention in every handler.

## Data flow

```
MCP client → tools/call → src/server.ts → src/tools/*.ts
  → src/api/resolve.ts (owner/name→repoId, pr→pullId, agent→agentId)
  → src/api/client.ts (native fetch) → DevDigest API :3001
  → src/tools/_shared.ts (concise/detailed, cap, untrusted-wrap) → text content
```

## Testing

Unit tests mock the `ApiClient` and cover the resolvers and their exact
error-forward strings, every tool handler (shaping, severity filter, cap note, the
timeout fallback, the missing-key path, blast-radius gating), and the token budget.
A single `contract.it.test.ts` drives the built server over an in-memory transport
against a real API and **self-skips when the API is unreachable** — the `.it.test.ts`
suffix keeps it out of the Docker-free unit lane. No Docker and no LLM are stood up
in `mcp/`; the API owns that.

## Open questions

- **Ingest-by-number** would let the tools review a PR that has aged out of the
  sync window (R2/R3). That is a server-side enhancement, not part of this package.
- **A `run_id → PR` server lookup** would remove the process-local map's restart
  fragility (R5), so `get_findings({run_id})` would not need the `repo`+`pr`
  fallback.
- **A token-missing signal** from the PR-list endpoint would let the tool
  distinguish "no `GITHUB_TOKEN`" from "PR genuinely not found" (R3).
- **Streamable-HTTP transport / remote hosting** — out of scope; stdio local only.
