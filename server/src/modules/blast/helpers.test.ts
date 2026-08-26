import { describe, it, expect } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import type { BlastResult, IndexState } from '../repo-intel/types.js';
import { mapBlastResult } from './helpers.js';
import { DEFAULT_BLAST_SUMMARY, MAX_CALLERS_PER_SYMBOL } from './constants.js';

const fullIndex: IndexState = {
  status: 'full',
  filesIndexed: 10,
  filesSkipped: 0,
  durationMs: 5,
  repoId: 'r1',
  lastIndexedSha: 'sha1',
  indexerVersion: 1,
  updatedAt: new Date(),
};

describe('mapBlastResult', () => {
  it('groups callers by viaSymbol and attributes endpoints/crons from factsByFile', () => {
    const result: BlastResult = {
      changedSymbols: [
        { file: 'src/a.ts', name: 'foo', kind: 'function' },
        { file: 'src/b.ts', name: 'bar', kind: 'function' },
      ],
      callers: [
        { file: 'src/x.ts', symbol: 'callFoo', viaSymbol: 'foo', line: 10, rank: 5 },
        { file: 'src/y.ts', symbol: 'alsoFoo', viaSymbol: 'foo', line: 20, rank: 9 },
        { file: 'src/z.ts', symbol: 'callBar', viaSymbol: 'bar', line: 30, rank: 1 },
      ],
      impactedEndpoints: ['GET /x', 'POST /y'],
      factsByFile: {
        'src/x.ts': { endpoints: ['GET /x'], crons: ['nightly'] },
        'src/y.ts': { endpoints: ['POST /y'], crons: [] },
        'src/z.ts': { endpoints: [], crons: ['weekly'] },
      },
    };

    const map = mapBlastResult(result, fullIndex);
    expect(BlastRadius.parse(map)).toBeTruthy();

    expect(map.changed_symbols).toHaveLength(2);
    expect(map.downstream.map((d) => d.symbol)).toEqual(['foo', 'bar']);

    const foo = map.downstream.find((d) => d.symbol === 'foo')!;
    // rank-desc order: alsoFoo (9) before callFoo (5).
    expect(foo.callers.map((c) => c.name)).toEqual(['alsoFoo', 'callFoo']);
    expect(foo.callers[0]).toEqual({ name: 'alsoFoo', file: 'src/y.ts', line: 20 });
    // endpoints/crons unioned across the group's caller files.
    expect(foo.endpoints_affected.sort()).toEqual(['GET /x', 'POST /y']);
    expect(foo.crons_affected).toEqual(['nightly']);

    const bar = map.downstream.find((d) => d.symbol === 'bar')!;
    expect(bar.endpoints_affected).toEqual([]);
    expect(bar.crons_affected).toEqual(['weekly']);

    expect(map.summary).toBe(DEFAULT_BLAST_SUMMARY);
    expect(map.index_state).toEqual({ status: 'full', reason: null });
  });

  it('caps callers per symbol at MAX_CALLERS_PER_SYMBOL, keeping the highest ranks', () => {
    const callers = Array.from({ length: 30 }, (_, i) => ({
      file: `src/c${i}.ts`,
      symbol: `caller${i}`,
      viaSymbol: 'foo',
      line: i + 1,
      rank: i, // rank 29 is highest
    }));
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers,
      impactedEndpoints: [],
      factsByFile: {},
    };

    const map = mapBlastResult(result, fullIndex);
    const foo = map.downstream[0]!;
    expect(foo.callers).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    // highest rank first, and the lowest-rank callers are dropped.
    expect(foo.callers[0]!.name).toBe('caller29');
    expect(foo.callers.map((c) => c.name)).not.toContain('caller0');
  });

  it('degraded result: no factsByFile → flat endpoints fallback, empty (not fabricated) arrays, populated index_state', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers: [{ file: 'src/x.ts', symbol: 'callFoo', viaSymbol: 'foo', line: 10, rank: 0 }],
      impactedEndpoints: ['GET /flat'],
      degraded: true,
      reason: 'no_data',
      // factsByFile absent
    };
    const degradedIndex: IndexState = {
      ...fullIndex,
      status: 'degraded',
      degraded: true,
      degradedReason: 'index_failed',
    };

    const map = mapBlastResult(result, degradedIndex);
    expect(BlastRadius.parse(map)).toBeTruthy();
    const foo = map.downstream[0]!;
    // fell back to the flat map-level endpoints; no cron attribution available.
    expect(foo.endpoints_affected).toEqual(['GET /flat']);
    expect(foo.crons_affected).toEqual([]);
    // index_state reflects the degraded state, never masked as empty.
    expect(map.index_state.status).toBe('degraded');
    expect(map.index_state.reason).toBe('index_failed');
  });

  it('empty result still yields a valid, non-fabricated BlastRadius', () => {
    const result: BlastResult = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'no_data',
    };
    const map = mapBlastResult(result, { ...fullIndex, status: 'partial' });
    expect(BlastRadius.parse(map)).toBeTruthy();
    expect(map.changed_symbols).toEqual([]);
    expect(map.downstream).toEqual([]);
    expect(map.index_state.status).toBe('partial');
  });
});
