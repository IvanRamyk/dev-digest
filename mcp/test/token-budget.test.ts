import { describe, it, expect } from 'vitest';
import { connectHarness } from './harness.js';
import { testConfig } from './fixtures.js';

/**
 * The serialized `tools/list` is sent on (nearly) every message, so it is pure
 * overhead on the context window. This test pins that overhead: it builds the
 * real server, lists the tools, and asserts the serialized payload stays under a
 * budget. A chars/4 heuristic stands in for a tokenizer (no tiktoken dep).
 *
 * Budget rationale: 5 default tools with flat string args and short descriptions
 * (blast-radius is now real and default-on, plan §7-R1 — it adds one tool's fixed
 * schema/annotation overhead, ~150 tokens over the prior 4-tool floor, with its
 * description already tightened). If a change pushes this over budget, tighten a
 * description or drop a .describe() — do not raise the ceiling casually.
 */
const APPROX_TOKEN_BUDGET = 1100;
const approxTokens = (json: string): number => Math.ceil(json.length / 4);

describe('tools/list token budget', () => {
  it('default 5-tool listing stays under budget and declares exactly the 5 tools', async () => {
    const { client, close } = await connectHarness(testConfig);
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual([
        'devdigest_get_blast_radius',
        'devdigest_get_conventions',
        'devdigest_get_findings',
        'devdigest_list_agents',
        'devdigest_run_agent_on_pr',
      ]);
      // No tool declares an outputSchema (token budget).
      for (const t of tools) expect(t.outputSchema).toBeUndefined();

      const serialized = JSON.stringify(tools);
      const tokens = approxTokens(serialized);
      expect(tokens).toBeLessThanOrEqual(APPROX_TOKEN_BUDGET);
    } finally {
      await close();
    }
  });
});
