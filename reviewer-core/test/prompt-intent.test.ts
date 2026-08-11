/**
 * assemblePrompt — the `## Intent & scope` section: rendered untrusted-wrapped
 * before the diff when an intent is present, omitted when it is absent/empty,
 * and mirrored into the trace assembly.
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';

const INTENT = {
  summary: 'Add rate limiting to the public API endpoints.',
  inScope: ['src/middleware/rate-limit.ts', 'public API routes'],
  outOfScope: ['auth', 'billing'],
};

describe('assemblePrompt — ## Intent & scope', () => {
  it('renders the section inside <untrusted> before the diff', () => {
    const { messages, assembly } = assemblePrompt({ system: 'sys', diff: 'DIFF', intent: INTENT });
    const user = messages[1]!.content;

    expect(user).toContain('## Intent & scope');
    expect(user).toContain('<untrusted source="intent">');
    expect(user).toContain('Add rate limiting to the public API endpoints.');
    expect(user).toContain('In scope:');
    expect(user).toContain('- auth');
    // Ordering: intent before the diff.
    expect(user.indexOf('## Intent & scope')).toBeLessThan(user.indexOf('## Diff to review'));
    // Mirrored into the trace assembly (wrapped).
    expect(assembly.intent).toContain('<untrusted source="intent">');
    expect(assembly.intent).toContain('Out of scope:');
  });

  it('omits the section when no intent is supplied (no behaviour change)', () => {
    const { messages, assembly } = assemblePrompt({ system: 'sys', diff: 'DIFF' });
    expect(messages[1]!.content).not.toContain('## Intent & scope');
    expect(assembly.intent ?? null).toBeNull();
  });

  it('omits the section when the intent bag is entirely empty', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      intent: { summary: '   ', inScope: [], outOfScope: [] },
    });
    expect(messages[1]!.content).not.toContain('## Intent & scope');
    expect(assembly.intent ?? null).toBeNull();
  });
});
