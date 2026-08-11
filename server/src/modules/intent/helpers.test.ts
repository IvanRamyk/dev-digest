import { describe, it, expect } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import {
  extractHunkHeaders,
  formatHunkHeaders,
  formatIntentSources,
  estimateTokens,
} from './helpers.js';

const DIFF: UnifiedDiff = {
  raw: [
    'diff --git a/src/config.ts b/src/config.ts',
    '@@ -10,3 +10,4 @@',
    '   port: 3000,',
    '+  stripeKey: "sk_live_SECRET",',
    '   redisUrl: x,',
  ].join('\n'),
  files: [
    {
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      hunks: [
        { file: 'src/config.ts', oldStart: 10, oldLines: 3, newStart: 10, newLines: 4, newLineNumbers: [10, 11, 12, 13] },
      ],
    },
    {
      path: 'src/app.ts',
      additions: 0,
      deletions: 0,
      hunks: [
        { file: 'src/app.ts', oldStart: 1, oldLines: 0, newStart: 1, newLines: 5, newLineNumbers: [1, 2, 3, 4, 5] },
        { file: 'src/app.ts', oldStart: 40, oldLines: 2, newStart: 42, newLines: 2, newLineNumbers: [42, 43] },
      ],
    },
  ],
};

describe('extractHunkHeaders', () => {
  it('emits only paths + reconstructed @@ headers — never a code line', () => {
    const out = extractHunkHeaders(DIFF);
    expect(out).toEqual([
      { path: 'src/config.ts', headers: ['@@ -10,3 +10,4 @@'] },
      { path: 'src/app.ts', headers: ['@@ -1,0 +1,5 @@', '@@ -40,2 +42,2 @@'] },
    ]);

    // The critical guarantee: NOTHING from a hunk body reaches the classifier.
    const flat = JSON.stringify(out);
    expect(flat).not.toContain('sk_live_SECRET');
    expect(flat).not.toContain('stripeKey');
    expect(flat).not.toContain('port: 3000');
  });
});

describe('formatHunkHeaders', () => {
  it('renders each file with its @@ headers and no diff bodies', () => {
    const text = formatHunkHeaders(extractHunkHeaders(DIFF));
    expect(text).toContain('src/config.ts');
    expect(text).toContain('@@ -10,3 +10,4 @@');
    expect(text).not.toContain('sk_live_SECRET');
  });
});

describe('formatIntentSources', () => {
  it('lists sources with their availability, none when empty', () => {
    expect(formatIntentSources([])).toBe('(none)');
    expect(
      formatIntentSources([
        { type: 'issue', ref: '#471', status: 'available' },
        { type: 'spec', ref: 'specs/x.md', status: 'missing' },
      ]),
    ).toBe('- issue: #471 [available]\n- spec: specs/x.md [missing]');
  });
});

describe('estimateTokens', () => {
  it('is a chars/4 ceiling', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
