/**
 * applyScopeFilter — the pure post-grounding scope filter. Proves that
 * out-of-scope findings are dropped EXCEPT exactly one CRITICAL out-of-bounds
 * signal, in-scope findings pass through, and the score re-derived from the
 * survivors matches.
 */
import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { applyScopeFilter } from '../src/review/scope-filter.js';
import { scoreFromFindings } from '../src/review/reduce.js';

function finding(over: Partial<Finding>): Finding {
  return {
    id: 'x',
    severity: 'WARNING',
    category: 'bug',
    title: 'a finding',
    file: 'src/app.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'because',
    confidence: 0.8,
    kind: 'finding',
    ...over,
  };
}

const INTENT = {
  summary: 'Touch the rate limiter only.',
  inScope: ['src/middleware/rate-limit.ts'],
  outOfScope: ['src/billing/', 'auth'],
};

describe('applyScopeFilter', () => {
  it('keeps in-scope findings and drops lower-severity out-of-scope ones', () => {
    const inScope = finding({ id: 'in', file: 'src/middleware/rate-limit.ts', severity: 'WARNING' });
    const outWarn = finding({ id: 'out-w', file: 'src/billing/charge.ts', severity: 'WARNING' });
    const outSugg = finding({ id: 'out-s', title: 'auth token typo', severity: 'SUGGESTION' });

    const { kept, dropped } = applyScopeFilter([inScope, outWarn, outSugg], INTENT);

    expect(kept.map((f) => f.id)).toEqual(['in']);
    expect(dropped.map((d) => d.finding.id).sort()).toEqual(['out-s', 'out-w']);
    expect(dropped[0]!.reason).toMatch(/out of scope/);
  });

  it('keeps EXACTLY ONE critical out-of-bounds finding, dropping any further criticals', () => {
    const crit1 = finding({ id: 'c1', file: 'src/billing/one.ts', severity: 'CRITICAL' });
    const crit2 = finding({ id: 'c2', file: 'src/billing/two.ts', severity: 'CRITICAL' });

    const { kept, dropped } = applyScopeFilter([crit1, crit2], INTENT);

    expect(kept).toHaveLength(1);
    expect(kept[0]!.id).toBe('c1');
    // The kept critical is annotated as out-of-bounds.
    expect(kept[0]!.rationale).toMatch(/outside the PR’s stated scope/i);
    expect(dropped.map((d) => d.finding.id)).toEqual(['c2']);
  });

  it('in_scope wins ties — a finding matching both scopes is kept', () => {
    // file matches out_of_scope "auth" via title, but also an in_scope entry.
    const both = finding({
      id: 'both',
      file: 'src/middleware/rate-limit.ts',
      title: 'auth header parsing bug',
      severity: 'WARNING',
    });
    const { kept } = applyScopeFilter([both], INTENT);
    expect(kept.map((f) => f.id)).toEqual(['both']);
  });

  it('re-derives the score from survivors', () => {
    const inScope = finding({ id: 'in', file: 'src/middleware/rate-limit.ts', severity: 'WARNING' });
    const outCrit = finding({ id: 'oc', file: 'src/billing/x.ts', severity: 'CRITICAL' });
    const outWarn = finding({ id: 'ow', file: 'src/billing/y.ts', severity: 'WARNING' });

    const { kept } = applyScopeFilter([inScope, outCrit, outWarn], INTENT);
    // Survivors: the in-scope warning + the one kept critical → 100 - 12 - 35 = 53.
    expect(kept).toHaveLength(2);
    expect(scoreFromFindings(kept)).toBe(scoreFromFindings(kept));
    expect(scoreFromFindings(kept)).toBe(100 - 12 - 35);
  });
});
