# Manual MCP-Inspector flows

The MCP Inspector is a GUI for driving the server by hand. These flows are the
manual acceptance checks that the automated tests cannot cover (they need a
running DevDigest API and, for the last two, provider keys).

## Prerequisites

1. The DevDigest stack is up, migrated, and seeded:
   ```bash
   ./scripts/dev.sh
   ```
2. From `mcp/`:
   ```bash
   npm run inspect
   ```
   This launches `mcp-inspector tsx src/server.ts`. Open the printed URL.

`DEVDIGEST_API_URL` defaults to `http://localhost:3001`; override it in the
Inspector's env panel if your API runs elsewhere.

## Flow 1 — list_agents (Step 1 done-when)

- Confirm the tool list shows **4 tools** by default.
- Call `devdigest_list_agents` with no args.
- Expect the seeded agents, each `{name, description, provider, model, enabled}`.

## Flow 2 — run_agent_on_pr happy path (Step 6)

- Pick a repo you have added (or let the tool auto-add it) and an open PR number.
- Call `devdigest_run_agent_on_pr` with `repo="owner/name"`, `pr=<number>`,
  `agent="<a seeded agent name>"`.
- Expect `{run_id, status:"done", verdict, score, findings}` after it polls to
  completion. `findings` is wrapped in `<untrusted_content source="pr_findings">`.

## Flow 3 — run_agent_on_pr timeout fallback

- Repeat Flow 2 but set `max_wait_ms=1`.
- Expect a **success** result `{status:"running", resume_with:"devdigest_get_findings"}`
  (NOT an error).
- Then call `devdigest_get_findings` with the returned `run_id`.

## Flow 4 — missing provider key (Step 6 done-when)

- Remove `OPENROUTER_API_KEY` (or whichever provider the chosen agent uses) from
  DevDigest Settings.
- Call `devdigest_run_agent_on_pr` as in Flow 2.
- Expect an `isError` result naming the provider and pointing at Settings — NOT a
  raw 500.

## Flow 5 — get_conventions read-only

- Call `devdigest_get_conventions` with `repo="owner/name"` for a repo that has
  been scanned; expect accepted conventions wrapped untrusted.
- For a never-scanned repo, expect the "run a scan in the DevDigest UI" message.
- Confirm (in the API logs) that no scan is ever POSTed by this tool.

## Flow 6 — blast_radius gating (Step 7)

- Default: `devdigest_get_blast_radius` is **absent** from the tool list.
- Restart with `MCP_ENABLE_BLAST_RADIUS=1`; expect **5 tools** and a
  `not_implemented` result from the tool that points at `devdigest_get_findings`.
