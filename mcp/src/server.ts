#!/usr/bin/env node
/**
 * stdio entrypoint for the DevDigest MCP server.
 *
 * CRITICAL: this process speaks JSON-RPC over stdout. Nothing may write to
 * stdout except the transport — a stray `console.log` corrupts the stream and
 * breaks every client. All diagnostics go to STDERR via `console.error`.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from './bootstrap.js';

async function main(): Promise<void> {
  const { server, config } = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — safe with the stdio transport.
  console.error(`[devdigest-mcp] ready · API=${config.apiUrl} · tools=5 (blast_radius on)`);
}

main().catch((err) => {
  console.error('[devdigest-mcp] fatal:', err);
  process.exit(1);
});
