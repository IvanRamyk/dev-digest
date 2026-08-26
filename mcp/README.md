# `@devdigest/mcp` — local MCP server for DevDigest

A local, stdio [Model Context Protocol](https://modelcontextprotocol.io) server
that exposes DevDigest's review capabilities as tools an MCP client (Claude
Desktop, Claude Code, the MCP Inspector, …) can call.

It is a **thin client over the DevDigest HTTP API** at `http://localhost:3001`.
It holds no state, touches no database, and imports no `server/` internals — the
`server/` package stays the single owner of I/O and state. Every tool maps onto
routes that already exist.

This is the 5th standalone package (like `reviewer-core/`): its own
`package.json` and `package-lock.json`, `type: module`, **npm** (not pnpm), and it
consumes the shared Zod contracts read-only through a tsconfig path alias to
`../server/src/vendor/shared`.

## Prerequisites

1. **The DevDigest stack is running, migrated, and seeded.** From the repo root:
   ```bash
   ./scripts/dev.sh
   ```
   Migrations do **not** run on boot — if you see `relation ... does not exist`,
   run `cd server && pnpm db:migrate`.
2. **A provider key for the agent you want to run.** Seeded agents default to
   provider `openrouter`, so the first `run_agent_on_pr` needs `OPENROUTER_API_KEY`
   set in the DevDigest UI (Settings → API Keys). A missing key surfaces as an
   actionable tool error, not a crash.
3. **Install this package** (npm, not pnpm):
   ```bash
   cd mcp && npm install
   ```

## MCP client configuration

Point your MCP client at `src/server.ts` via `tsx` (no build step — the package
emits no JS). Replace `<ABS>` with the absolute path to this repo.

```json
{
  "mcpServers": {
    "devdigest": {
      "command": "npx",
      "args": ["-y", "tsx", "<ABS>/mcp/src/server.ts"],
      "env": {
        "DEVDIGEST_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

To try it by hand instead, run the Inspector:

```bash
cd mcp && npm run inspect
```

## Tools

By default the server registers **4 tools**:

| Tool | What it does |
|---|---|
| `devdigest_list_agents` | List the configured review agents. |
| `devdigest_run_agent_on_pr` | Resolve `owner/name` + PR number + agent name, start a review, poll to completion, and return `{run_id, verdict, score, findings}`. |
| `devdigest_get_findings` | Read findings from a completed review, by `run_id` (this session) or `repo` + `pr`. |
| `devdigest_get_conventions` | Read a repo's learned conventions (accepted by default). Read-only — never triggers a scan. |

A 5th, `devdigest_get_blast_radius`, is a **stub** that is registered only when
`MCP_ENABLE_BLAST_RADIUS` is set; it returns a `not_implemented` result pointing
at `devdigest_get_findings`.

All tools take **flat arguments** (`repo="owner/name"`, `pr=<number>`,
`agent="<name>"`) and return plain-text JSON. Third-party-derived content
(findings, conventions) is wrapped in an `<untrusted_content>` marker so a
downstream model treats it as data, not instructions.

## Environment variables

| Var | Default | Meaning |
|---|---|---|
| `DEVDIGEST_API_URL` | `http://localhost:3001` | Base URL of the DevDigest API (no `/api` prefix — routes sit at root). |
| `MCP_RUN_MAX_WAIT_MS` | `90000` | How long `run_agent_on_pr` blocks (polling) before returning `status:"running"`. |
| `MCP_POLL_INTERVAL_MS` | `3000` | Delay between run-status polls. |
| `MCP_ENABLE_BLAST_RADIUS` | *(off)* | When `1`/`true`, register the (stub) `devdigest_get_blast_radius` tool. |
| `DEVDIGEST_API_TOKEN` | *(unset)* | Optional bearer token, forwarded as `Authorization: Bearer …`. The local API is no-auth; this is forward-compat only and is never logged. |

## Default decisions & limitations

These are deliberate scoping choices (see `specs/mcp-server.md` and the plan):

- **`run_agent_on_pr` blocks with a timeout fallback.** The review pipeline is
  async fire-and-forget server-side, so there is no synchronous run-and-return.
  When the wait budget elapses the tool returns a **success**
  `{status:"running", resume_with:"devdigest_get_findings"}` — not an error.
- **Only open / recently synced PRs are reviewable (R2).** A PR enters the DB only
  via GitHub PR-sync; one closed or merged outside the sync window returns a
  "not found — sync window" error. There is no ingest-by-number path.
- **No `GITHUB_TOKEN` → the PR list silently finds nothing (R3).** The API does not
  expose the token-missing case, so it is reported as an ordinary "PR not found".
- **Duplicate agent names error, they don't auto-pick (R4).** Agent names have no
  unique constraint; rename one in the DevDigest UI.
- **The `run_id → PR` map is in-memory and process-scoped (R5).** After a restart,
  `get_findings({run_id})` for an old run falls back to requiring `repo` + `pr`.

## Development

From `mcp/`:

```bash
npm run typecheck     # tsc --noEmit
npm run test          # unit tests (contract.it.test.ts self-skips if the API is down)
npm run dev           # tsx watch src/server.ts
```

The stdio transport speaks JSON-RPC over **stdout**, so all logging goes to
**stderr** (`console.error`) — a stray `console.log` corrupts the stream.
