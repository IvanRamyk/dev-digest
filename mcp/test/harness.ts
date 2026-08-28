/**
 * In-memory MCP harness — wires an SDK Client to a built server over a linked
 * transport pair, so tests can exercise `tools/list` / `tools/call` exactly as a
 * real client would, without stdio or a network.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../src/bootstrap.js';
import { fakeClient } from './fixtures.js';
import type { McpConfig } from '../src/config.js';

export async function connectHarness(config: McpConfig): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const { server } = buildServer({ config, client: fakeClient() });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
