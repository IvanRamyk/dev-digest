/**
 * Composition root: build config + api client, construct an McpServer, and
 * register the enabled tools on it.
 *
 * Default set is 5 tools. `devdigest_get_blast_radius` is now a real handler over
 * `GET /pulls/:id/blast` and is registered BY DEFAULT (plan §7-R1). The legacy
 * `MCP_ENABLE_BLAST_RADIUS` flag is retained only to force-enable in older
 * configs; the tool is on regardless.
 *
 * `outputSchema` is omitted on every tool (token budget, plan §4/§7-R1); results
 * are plain text content blocks.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ApiClient } from './api/client.js';
import { loadConfig, type McpConfig } from './config.js';
import {
  getBlastRadiusShape,
  getConventionsShape,
  getFindingsShape,
  listAgentsShape,
  runAgentOnPrShape,
} from './schemas.js';
import { listAgentsHandler } from './tools/list-agents.js';
import { getFindingsHandler } from './tools/get-findings.js';
import { getConventionsHandler } from './tools/get-conventions.js';
import { runAgentOnPrHandler } from './tools/run-agent-on-pr.js';
import { blastRadiusHandler } from './tools/get-blast-radius.js';

/** Package version + protocol identity reported in the MCP initialize handshake. */
const SERVER_INFO = { name: 'devdigest-mcp', version: '0.0.0' } as const;

export interface BuiltServer {
  server: McpServer;
  config: McpConfig;
  client: ApiClient;
}

/** Build an McpServer with the enabled tools registered. Does not connect a transport. */
export function buildServer(overrides?: { config?: McpConfig; client?: ApiClient }): BuiltServer {
  const config = overrides?.config ?? loadConfig();
  const client = overrides?.client ?? new ApiClient(config);

  const server = new McpServer(SERVER_INFO, {
    capabilities: { tools: { listChanged: true } },
  });

  registerDefaultTools(server, client, config);
  registerBlastRadius(server, client);

  return { server, config, client };
}

/** Register the always-on tools (4). */
export function registerDefaultTools(
  server: McpServer,
  client: ApiClient,
  config: McpConfig,
): void {
  server.registerTool(
    'devdigest_list_agents',
    {
      title: 'List review agents',
      description:
        'List the DevDigest review agents (name, provider, model, enabled). Use to pick a valid agent name before running a review.',
      inputSchema: listAgentsShape,
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    listAgentsHandler(client),
  );

  server.registerTool(
    'devdigest_run_agent_on_pr',
    {
      title: 'Run a review agent on a PR',
      description:
        'Run a DevDigest review agent on a GitHub PR and return its findings. Resolves owner/name + PR number + agent name, starts the run, and blocks (polling) until it finishes or the wait budget elapses.',
      inputSchema: runAgentOnPrShape,
      annotations: {
        readOnlyHint: false,
        openWorldHint: true,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    runAgentOnPrHandler(client, config),
  );

  server.registerTool(
    'devdigest_get_findings',
    {
      title: 'Get review findings',
      description:
        'Read the findings from a completed review — by run_id (from a prior run in this session) or by repo + PR number. Filter by severity; results are capped and severity-ordered.',
      inputSchema: getFindingsShape,
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    getFindingsHandler(client, config),
  );

  server.registerTool(
    'devdigest_get_conventions',
    {
      title: 'Get repo conventions',
      description:
        'Read a repo\'s learned coding conventions (accepted by default). Read-only — never triggers a scan.',
      inputSchema: getConventionsShape,
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    getConventionsHandler(client),
  );
}

/** Register the blast-radius tool (5th tool, default-on). */
export function registerBlastRadius(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'devdigest_get_blast_radius',
    {
      title: 'Get PR blast radius',
      description:
        'Map a PR\'s impact: changed symbols, their callers, and affected endpoints/crons. Read-only.',
      inputSchema: getBlastRadiusShape,
      annotations: { readOnlyHint: true, openWorldHint: false, idempotentHint: true },
    },
    blastRadiusHandler(client),
  );
}
