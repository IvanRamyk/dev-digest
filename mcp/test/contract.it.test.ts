/**
 * Contract integration test — drives the built MCP server over an in-memory
 * transport against a REAL DevDigest API (the client inside the server makes
 * live HTTP calls to DEVDIGEST_API_URL).
 *
 * `.it.test.ts` per TESTING.md: it needs the running stack. It SELF-SKIPS when
 * the API is unreachable, so the unit lane stays green without Docker/the API.
 * Report a skip as skipped, never as passed.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../src/bootstrap.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig();

async function apiReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${config.apiUrl}/agents`, { method: 'GET' });
    // Any HTTP response (even 4xx) means the server is up.
    return res.status < 600;
  } catch {
    return false;
  }
}

describe('MCP server ↔ live DevDigest API (contract)', () => {
  let reachable = false;

  beforeAll(async () => {
    reachable = await apiReachable();
    if (!reachable) {
      // Visible in the reporter as a reason, not a silent pass.
      console.error(`[contract.it] skipping — API unreachable at ${config.apiUrl}`);
    }
  });

  it('lists tools and calls devdigest_list_agents end-to-end', async ({ skip }) => {
    if (!reachable) return skip();

    const { server } = buildServer({ config });
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'contract-test', version: '0.0.0' });
    await Promise.all([server.connect(serverT), client.connect(clientT)]);

    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toContain('devdigest_list_agents');

      const result = await client.callTool({ name: 'devdigest_list_agents', arguments: {} });
      // The real API responds; we should get a text content block back, not an error.
      const content = result.content as { type: string; text: string }[];
      expect(content.some((c) => c.type === 'text')).toBe(true);
      expect(result.isError).toBeFalsy();
    } finally {
      await client.close();
      await server.close();
    }
  });
});
