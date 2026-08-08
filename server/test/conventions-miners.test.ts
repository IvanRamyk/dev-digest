import { describe, it, expect } from 'vitest';
import { mineChokepoints, mineRoleContracts, mineLayering, minePlacement } from '../src/modules/conventions/miners.js';

/**
 * The highest-value unit suite for the conventions feature: these are the
 * miners that make types A/B/E reachable at all (invisible inside any single
 * file, so a batch-of-file-bodies pipeline can't find them). Hermetic over
 * fixture rows — no Postgres, no clone, no model.
 */

describe('mineChokepoints', () => {
  it('finds a chokepoint: one internal importer of an external dep, with fan-in over the threshold', () => {
    const edges = Array.from({ length: 5 }, (_, i) => ({
      fromFile: `src/routes/${i}.ts`,
      toFile: 'src/lib/redis.ts',
    }));
    const externalImports = [{ file: 'src/lib/redis.ts', source: 'ioredis', line: 3 }];
    const out = mineChokepoints({ edges, externalImports });
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('chokepoint');
    expect(out[0]!.facts.module).toBe('src/lib/redis.ts');
    expect(out[0]!.supportCount).toBe(5);
  });

  it('finds nothing when two internal modules import the dep directly (no gateway)', () => {
    const edges = [{ fromFile: 'a.ts', toFile: 'src/lib/redis.ts' }];
    const externalImports = [
      { file: 'src/lib/redis.ts', source: 'ioredis', line: 1 },
      { file: 'src/other/direct.ts', source: 'ioredis', line: 1 },
    ];
    expect(mineChokepoints({ edges, externalImports })).toEqual([]);
  });

  it('rejects a universal import (react) with no gateway — every file imports it directly', () => {
    const externalImports = Array.from({ length: 20 }, (_, i) => ({
      file: `src/components/${i}.tsx`,
      source: 'react',
      line: 1,
    }));
    expect(mineChokepoints({ edges: [], externalImports })).toEqual([]);
  });

  it('skips a sole importer whose fan-in is below the threshold', () => {
    const edges = [{ fromFile: 'a.ts', toFile: 'src/lib/redis.ts' }];
    const externalImports = [{ file: 'src/lib/redis.ts', source: 'ioredis', line: 1 }];
    expect(mineChokepoints({ edges, externalImports })).toEqual([]);
  });
});

describe('mineRoleContracts', () => {
  it('returns the full endpoint population, not a sample', () => {
    const endpointFiles = ['a.ts', 'b.ts', 'c.ts', 'd.ts'];
    const signatures = endpointFiles.map((path, i) => ({
      path,
      name: `handler${i}`,
      line: 1,
      signature: `async function handler${i}(req): Promise<Result<T, ApiError>>`,
    }));
    const out = mineRoleContracts({ endpointFiles, signatures });
    expect(out).toHaveLength(1);
    expect(out[0]!.supportCount).toBe(4);
    expect(out[0]!.facts.population).toBe(4);
  });

  it('emits nothing below MIN_ROLE_POPULATION', () => {
    const endpointFiles = ['a.ts', 'b.ts'];
    const signatures = endpointFiles.map((path) => ({
      path,
      name: 'h',
      line: 1,
      signature: 'async function h(req): Promise<Result<T, ApiError>>',
    }));
    expect(mineRoleContracts({ endpointFiles, signatures })).toEqual([]);
  });

  it('emits nothing when there is no clear majority return shape (could be otherwise)', () => {
    const endpointFiles = ['a.ts', 'b.ts', 'c.ts', 'd.ts'];
    const signatures = [
      { path: 'a.ts', name: 'h', line: 1, signature: 'function h(req): Promise<Result<T, ApiError>>' },
      { path: 'b.ts', name: 'h', line: 1, signature: 'function h(req): Promise<Result<T, ApiError>>' },
      { path: 'c.ts', name: 'h', line: 1, signature: 'function h(req): Promise<Response>' },
      { path: 'd.ts', name: 'h', line: 1, signature: 'function h(req): Promise<Response>' },
    ];
    expect(mineRoleContracts({ endpointFiles, signatures })).toEqual([]);
  });
});

describe('mineLayering', () => {
  it('proposes a boundary only when both directories are large and the edge count is zero', () => {
    const files = [
      ...Array.from({ length: 4 }, (_, i) => `src/platform/${i}.ts`),
      ...Array.from({ length: 4 }, (_, i) => `src/adapters/${i}.ts`),
    ];
    const edges: Array<{ fromFile: string; toFile: string }> = []; // no cross-edges at all
    const out = mineLayering({ edges, files });
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('layering');
  });

  it('does not propose a boundary when directories are too small', () => {
    const files = ['src/platform/a.ts', 'src/adapters/b.ts'];
    expect(mineLayering({ edges: [], files })).toEqual([]);
  });

  it('does not propose a boundary when there is at least one cross-edge', () => {
    const files = [
      ...Array.from({ length: 4 }, (_, i) => `src/platform/${i}.ts`),
      ...Array.from({ length: 4 }, (_, i) => `src/adapters/${i}.ts`),
    ];
    const edges = [{ fromFile: 'src/platform/0.ts', toFile: 'src/adapters/0.ts' }];
    expect(mineLayering({ edges, files })).toEqual([]);
  });
});

describe('minePlacement', () => {
  it('finds a repeated Foo/Foo.tsx placement pattern', () => {
    const paths = [
      'client/src/app/skills/_components/SkillsView/SkillsView.tsx',
      'client/src/app/skills/_components/ImportDrawer/ImportDrawer.tsx',
      'client/src/components/skill-card/SkillCard/SkillCard.tsx',
    ];
    const out = minePlacement(paths);
    expect(out).toHaveLength(1);
    expect(out[0]!.supportCount).toBe(3);
  });

  it('emits nothing when mismatches are as common as matches (could be otherwise)', () => {
    const paths = [
      'a/Foo/Foo.tsx',
      'b/Bar/Bar.tsx',
      'c/Baz/Baz.tsx',
      'x/Foo/Other.tsx',
      'y/Bar/Different.tsx',
      'z/Baz/Whatever.tsx',
    ];
    expect(minePlacement(paths)).toEqual([]);
  });
});
