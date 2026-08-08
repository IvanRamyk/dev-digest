import { describe, it, expect } from 'vitest';
import {
  normalizeRuleKey,
  dedupeCandidates,
  groupFilesIntoBatches,
  computeConfidence,
  isSafeGrepPattern,
  isSafeRepoRelativePath,
  isJunkRuleText,
  isPrettierRestatement,
  numberLines,
  buildSkillBody,
} from '../src/modules/conventions/helpers.js';
import type { RawCandidate } from '../src/modules/conventions/types.js';

describe('normalizeRuleKey', () => {
  it('collapses "Always use ===" and "Use `===` instead of `==`" to the same key', () => {
    expect(normalizeRuleKey('Always use ===')).toBe(normalizeRuleKey('Use `===` instead of `==`'));
  });

  it('is order-independent (token sort)', () => {
    expect(normalizeRuleKey('naming files kebab-case')).toBe(normalizeRuleKey('kebab-case naming files'));
  });

  it('drops connective stopwords', () => {
    expect(normalizeRuleKey('always validate input')).toBe(normalizeRuleKey('validate input'));
  });
});

describe('dedupeCandidates', () => {
  function raw(over: Partial<RawCandidate>): RawCandidate {
    return {
      rule: 'Use async/await',
      category: 'other',
      evidence: { path: 'a.ts', startLine: 1, endLine: 1, snippet: '' },
      source: 'model',
      rank: 1,
      ...over,
    };
  }

  it('keeps one candidate per normalized rule key, preferring lower rank', () => {
    const strong = raw({ rule: 'Use async/await', rank: 0 });
    const weak = raw({ rule: 'Always use async/await', rank: 5 });
    const out = dedupeCandidates([weak, strong]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(strong);
  });

  it('a config-sourced row always wins its group over a model duplicate', () => {
    const modelRow = raw({ rule: 'Do not use a default export', rank: 0, source: 'model' });
    const configRow = raw({ rule: 'Do not use a default export', rank: 9, source: 'config' });
    const out = dedupeCandidates([modelRow, configRow]);
    expect(out).toEqual([configRow]);
  });

  it('leaves distinct rules alone', () => {
    const a = raw({ rule: 'Use async/await' });
    const b = raw({ rule: 'Prefer named exports' });
    expect(dedupeCandidates([a, b])).toHaveLength(2);
  });
});

describe('groupFilesIntoBatches', () => {
  it('groups by first path segment and chunks to batchSize', () => {
    const paths = ['src/a.ts', 'src/b.ts', 'src/c.ts', 'lib/d.ts'];
    const batches = groupFilesIntoBatches(paths, 2, 10);
    expect(batches).toEqual([['src/a.ts', 'src/b.ts'], ['src/c.ts'], ['lib/d.ts']]);
  });

  it('stops emitting once maxBatches is reached', () => {
    const paths = ['a/1.ts', 'a/2.ts', 'a/3.ts', 'a/4.ts'];
    const batches = groupFilesIntoBatches(paths, 1, 2);
    expect(batches).toHaveLength(2);
  });
});

describe('numberLines', () => {
  it('prefixes each line with its 1-based number', () => {
    expect(numberLines(['a', 'b'])).toBe('1| a\n2| b');
  });
});

describe('computeConfidence', () => {
  it('config verification is always 1', () => {
    expect(computeConfidence(0, 0, 'config')).toBe(1);
  });

  it('unverified is capped at the flat constant', () => {
    expect(computeConfidence(10, 0, 'unverified')).toBe(0.3);
  });

  it('zero support is zero confidence', () => {
    expect(computeConfidence(0, 3, 'pattern')).toBe(0);
  });

  it('Laplace-smooths support vs violation', () => {
    expect(computeConfidence(3, 0, 'pattern')).toBeCloseTo(0.75);
    expect(computeConfidence(40, 0, 'semantic')).toBeCloseTo(40 / 41);
  });
});

describe('isSafeGrepPattern', () => {
  it('rejects a leading dash (parsed as an rg flag)', () => {
    expect(isSafeGrepPattern('-x')).toBe(false);
  });

  it('rejects nested unbounded quantifiers (ReDoS shape)', () => {
    expect(isSafeGrepPattern('(a+)+')).toBe(false);
  });

  it('rejects backreferences', () => {
    expect(isSafeGrepPattern('(a)\\1')).toBe(false);
  });

  it('accepts an ordinary pattern', () => {
    expect(isSafeGrepPattern('^\\s*export\\s')).toBe(true);
  });
});

describe('isSafeRepoRelativePath', () => {
  it('rejects traversal', () => {
    expect(isSafeRepoRelativePath('../etc/passwd')).toBe(false);
    expect(isSafeRepoRelativePath('src/../../etc/x')).toBe(false);
  });

  it('rejects an absolute path', () => {
    expect(isSafeRepoRelativePath('/etc/passwd')).toBe(false);
  });

  it('accepts an ordinary repo-relative path', () => {
    expect(isSafeRepoRelativePath('src/lib/redis.ts')).toBe(true);
  });
});

describe('isJunkRuleText', () => {
  it('drops questions and TODOs', () => {
    expect(isJunkRuleText('Should we use async/await?')).toBe(true);
    expect(isJunkRuleText('TODO: figure out naming')).toBe(true);
  });

  it('keeps a real rule', () => {
    expect(isJunkRuleText('Use async/await instead of .then() chains')).toBe(false);
  });
});

describe('isPrettierRestatement', () => {
  it('flags formatting-phrased rules', () => {
    expect(isPrettierRestatement('Always use single quotes')).toBe(true);
    expect(isPrettierRestatement('Use 2-space indentation')).toBe(true);
  });

  it('leaves a real convention alone', () => {
    expect(isPrettierRestatement('Redis access goes through src/lib/redis.ts')).toBe(false);
  });
});

describe('buildSkillBody', () => {
  it('groups by category in CATEGORY_ORDER and includes evidence lines', () => {
    const body = buildSkillBody('acme/payments-api', [
      {
        rule: 'Do not use a default export',
        category: 'imports',
        source: 'config',
        evidencePath: '.eslintrc.json',
        evidenceStartLine: 3,
        evidenceEndLine: 3,
        supportCount: 0,
        violationCount: 0,
      },
      {
        rule: 'Redis access goes through src/lib/redis.ts',
        category: 'structure',
        source: 'model',
        evidencePath: 'src/lib/redis.ts',
        evidenceStartLine: 1,
        evidenceEndLine: 10,
        supportCount: 12,
        violationCount: 0,
      },
    ]);
    expect(body).toContain('# acme/payments-api conventions');
    expect(body).toContain('## Structure');
    expect(body).toContain('## Imports');
    // structure precedes imports in CATEGORY_ORDER
    expect(body.indexOf('## Structure')).toBeLessThan(body.indexOf('## Imports'));
    expect(body).toContain('Evidence: from project config');
    expect(body).toContain('Evidence: `src/lib/redis.ts:1-10` — 12 files support, 0 exceptions');
  });
});
