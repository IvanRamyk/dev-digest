import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '@devdigest/reviewer-core';

/**
 * L02 — skills-in-prompt assembly (pure, no LLM). Modelled on prompt-callers.test.ts.
 *
 * The `## Skills / rules` section already existed in `assemblePrompt` before this
 * lesson — the gap was that nothing ever fed it a value. This asserts the section
 * renders where prompt.ts places it (after `## PR description`, before
 * `## Diff to review`) and that omitting `skills` is byte-identical to today.
 */

const COMMON = {
  system: 'You are a reviewer.',
  memory: ['Do not flag try/catch around JSON.parse'],
  specs: ['# Security baseline\nNo secrets in code.'],
  diff: '@@ -1 +1 @@\n+stripeKey',
  task: "Review PR #482 'rate limit'",
  prDescription: 'Adds a rate limiter.',
} as const;

describe('assemblePrompt + skills', () => {
  it('renders ## Skills / rules AFTER PR description and BEFORE Diff to review', () => {
    const skills = ['## test-coverage-rubric\nFlag missing branch coverage.'];
    const { messages } = assemblePrompt({ ...COMMON, skills });
    const user = messages[1]!.content;

    expect(user).toContain('## Skills / rules\n## test-coverage-rubric');

    const idxPr = user.indexOf('## PR description');
    const idxSkills = user.indexOf('## Skills / rules');
    const idxDiff = user.indexOf('## Diff to review');
    expect(idxPr).toBeGreaterThan(-1);
    expect(idxSkills).toBeGreaterThan(idxPr);
    expect(idxDiff).toBeGreaterThan(idxSkills);
  });

  it('joins multiple skill bodies with a blank line between them', () => {
    const skills = ['## a\nbody a', '## b\nbody b'];
    const { messages } = assemblePrompt({ ...COMMON, skills });
    const user = messages[1]!.content;
    expect(user).toContain('## Skills / rules\n## a\nbody a\n\n## b\nbody b');
  });

  it('omitting skills yields a byte-identical user message (acceptance: flag off ≡ no prompt change)', () => {
    const a = assemblePrompt({ ...COMMON });
    const b = assemblePrompt({ ...COMMON, skills: undefined });
    expect(a.messages[1]!.content).toBe(b.messages[1]!.content);
    expect(a.messages[1]!.content).not.toContain('## Skills / rules');
  });

  it('omits the section when skills is an empty array', () => {
    const base = assemblePrompt({ ...COMMON });
    const empty = assemblePrompt({ ...COMMON, skills: [] });
    expect(empty.messages[1]!.content).toBe(base.messages[1]!.content);
  });

  it('persists the joined skills block into prompt_assembly.skills for the run trace', () => {
    const skills = ['## rule\nDo the thing.'];
    const { assembly } = assemblePrompt({ ...COMMON, skills });
    expect(assembly.skills).toBe('## rule\nDo the thing.');
  });

  it('prompt_assembly.skills is null when no skills are linked', () => {
    const { assembly } = assemblePrompt({ ...COMMON });
    expect(assembly.skills).toBeNull();
  });
});
