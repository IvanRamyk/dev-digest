import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { classifyFile, RULES } from '../src/modules/smart-diff/classify.js';
import {
  buildGroups,
  buildSplitSuggestion,
  currentFindingRows,
  findingLinesByFile,
  type FileRow,
  type FindingLocation,
  type OrphanFindingLocationRow,
  type RunFindingLocationRow,
} from '../src/modules/smart-diff/helpers.js';
import { ROLE_ORDER, SPLIT_TOO_BIG_LINES } from '../src/modules/smart-diff/constants.js';

/**
 * Smart Diff classifier + folds — pure, no Docker. MUST NOT import
 * `test/helpers/pg.ts` (that would drag Docker into the unit lane).
 */

describe('classifyFile — precedence (first match wins)', () => {
  const cases: { path: string; additions?: number; deletions?: number; expect: string }[] = [
    // generated / boilerplate wins before test / doc / wiring
    { path: 'dist/index.js', expect: 'boilerplate' }, // dir segment, NOT wiring
    { path: 'build/main.ts', expect: 'boilerplate' },
    { path: '__snapshots__/x.snap', expect: 'boilerplate' }, // NOT test
    { path: 'node_modules/pkg/index.ts', expect: 'boilerplate' },
    { path: 'pnpm-lock.yaml', expect: 'boilerplate' },
    { path: 'package-lock.json', expect: 'boilerplate' },
    { path: 'go.sum', expect: 'boilerplate' },
    { path: 'types/api.d.ts', expect: 'boilerplate' }, // generated suffix
    { path: 'assets/logo.png', expect: 'boilerplate' }, // binary
    // drizzle migration metadata → boilerplate (generated wholesale by db:generate)
    { path: 'server/src/db/migrations/meta/0013_snapshot.json', expect: 'boilerplate' },
    { path: 'server/src/db/migrations/meta/_journal.json', expect: 'boilerplate' },
    // tests / docs → wiring
    { path: 'src/foo.test.ts', expect: 'wiring' },
    { path: 'src/__tests__/foo.ts', expect: 'wiring' },
    { path: 'test/helpers/pg.ts', expect: 'wiring' },
    { path: 'README.md', expect: 'wiring' },
    { path: 'docs/architecture.md', expect: 'wiring' },
    // config → wiring
    { path: 'package.json', expect: 'wiring' },
    { path: 'tsconfig.json', expect: 'wiring' },
    { path: 'vitest.config.ts', expect: 'wiring' },
    { path: 'tailwind.config.js', expect: 'wiring' },
    { path: 'config/app.yml', expect: 'wiring' },
    // generated migration SQL (the actual DDL) → wiring, not core
    { path: 'server/src/db/migrations/0013_milky_dagger.sql', expect: 'wiring' },
    // size-gated wiring basename
    { path: 'src/index.ts', additions: 5, deletions: 0, expect: 'wiring' },
    { path: 'src/index.ts', additions: 200, deletions: 0, expect: 'core' }, // too big → core
    { path: 'src/app.ts', additions: 3, deletions: 2, expect: 'wiring' },
    // core is the default an unknown extension degrades toward
    { path: 'src/thing.rs', expect: 'core' },
    { path: 'src/middleware/ratelimit.ts', expect: 'core' },
    { path: 'src/api/users.ts', additions: 300, deletions: 5, expect: 'core' },
  ];

  for (const c of cases) {
    it(`${c.path} (${c.additions ?? 0}/${c.deletions ?? 0}) → ${c.expect}`, () => {
      expect(
        classifyFile({ path: c.path, additions: c.additions ?? 0, deletions: c.deletions ?? 0 }),
      ).toBe(c.expect);
    });
  }

  it('every RULE role is one of the three SmartDiffRoles', () => {
    for (const rule of RULES) {
      expect(ROLE_ORDER).toContain(rule.role);
    }
  });
});

const FILES: FileRow[] = [
  { path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 }, // core
  { path: 'src/api/users.ts', additions: 7, deletions: 2 }, // core
  { path: 'package.json', additions: 3, deletions: 0 }, // wiring
  { path: 'src/index.ts', additions: 2, deletions: 0 }, // wiring
  { path: 'pnpm-lock.yaml', additions: 92, deletions: 24 }, // boilerplate
  { path: 'dist/bundle.js', additions: 140, deletions: 118 }, // boilerplate
];

describe('buildGroups — invariants', () => {
  it('always emits the three groups in ROLE_ORDER', () => {
    const groups = buildGroups(FILES, []);
    expect(groups.map((g) => g.role)).toEqual([...ROLE_ORDER]);
  });

  it('Σ group.files.length === files.length (no file dropped or duplicated)', () => {
    const groups = buildGroups(FILES, []);
    const total = groups.reduce((n, g) => n + g.files.length, 0);
    expect(total).toBe(FILES.length);
  });

  it('is deterministic under input shuffle', () => {
    const a = buildGroups(FILES, []);
    const shuffled = [...FILES].reverse();
    const b = buildGroups(shuffled, []);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('orders files with findings first, worst severity then churn', () => {
    const locations: FindingLocation[] = [
      { file: 'src/api/users.ts', startLine: 45, endLine: 45, severity: 'CRITICAL' },
    ];
    const groups = buildGroups(FILES, locations);
    const core = groups.find((g) => g.role === 'core')!;
    // users.ts has a CRITICAL finding → sorts before ratelimit.ts despite less churn
    expect(core.files[0]!.path).toBe('src/api/users.ts');
    expect(core.files[0]!.finding_lines).toEqual([45]);
  });

  it('every file has pseudocode_summary null', () => {
    const groups = buildGroups(FILES, []);
    for (const g of groups) for (const f of g.files) expect(f.pseudocode_summary).toBeNull();
  });
});

describe('findingLinesByFile', () => {
  it('unions inclusive ranges, dedupes and sorts', () => {
    const locations: FindingLocation[] = [
      { file: 'a.ts', startLine: 10, endLine: 12, severity: 'WARNING' },
      { file: 'a.ts', startLine: 11, endLine: 11, severity: 'CRITICAL' },
      { file: 'a.ts', startLine: 3, endLine: 3, severity: 'SUGGESTION' },
    ];
    expect(findingLinesByFile(locations).get('a.ts')).toEqual([3, 10, 11, 12]);
  });

  it('a very wide range contributes only its start_line', () => {
    const locations: FindingLocation[] = [
      { file: 'a.ts', startLine: 1, endLine: 500, severity: 'WARNING' },
    ];
    expect(findingLinesByFile(locations).get('a.ts')).toEqual([1]);
  });
});

describe('currentFindingRows — latest-run fold', () => {
  const loc = (over: Partial<RunFindingLocationRow>): RunFindingLocationRow => ({
    agentId: 'agent-1',
    runId: 'run-1',
    reviewId: 'review-1',
    file: 'src/config.ts',
    startLine: 12,
    endLine: 12,
    severity: 'CRITICAL',
    ...over,
  });

  it('supersession: newest run per agent wins, older run ignored', () => {
    // Rows arrive newest-first. run-2 is agent-1's latest; run-1 is superseded.
    const rows = [
      loc({ runId: 'run-2', reviewId: 'review-2', startLine: 20, endLine: 20 }),
      loc({ runId: 'run-1', reviewId: 'review-1', startLine: 12, endLine: 12 }),
    ];
    const out = currentFindingRows(rows, []);
    expect(out).toHaveLength(1);
    expect(out[0]!.startLine).toBe(20);
  });

  it('dead newest run (no review) contributes nothing, no fall-through', () => {
    const rows = [
      loc({ runId: 'run-2', reviewId: null, file: null, startLine: null, endLine: null, severity: null }),
      loc({ runId: 'run-1', reviewId: 'review-1', startLine: 12, endLine: 12 }),
    ];
    // run-2 is the latest for agent-1 and it died → agent contributes nothing.
    expect(currentFindingRows(rows, [])).toHaveLength(0);
  });

  it('run-less review (orphan) always counts', () => {
    const orphans: OrphanFindingLocationRow[] = [
      { file: 'src/config.ts', startLine: 12, endLine: 12, severity: 'CRITICAL' },
    ];
    expect(currentFindingRows([], orphans)).toHaveLength(1);
  });

  it('agent_id NULL collapses to one bucket (latest of the null-agent runs)', () => {
    const rows = [
      loc({ agentId: null, runId: 'run-b', reviewId: 'review-b', startLine: 99, endLine: 99 }),
      loc({ agentId: null, runId: 'run-a', reviewId: 'review-a', startLine: 12, endLine: 12 }),
    ];
    const out = currentFindingRows(rows, []);
    expect(out).toHaveLength(1);
    expect(out[0]!.startLine).toBe(99);
  });

  it('a kept run with a review but no finding produces no location', () => {
    const rows = [
      loc({ runId: 'run-1', reviewId: 'review-1', file: null, startLine: null, endLine: null, severity: null }),
    ];
    expect(currentFindingRows(rows, [])).toHaveLength(0);
  });
});

describe('buildSplitSuggestion', () => {
  it('under threshold → not too_big, no splits', () => {
    const groups = buildGroups(
      [{ path: 'src/a.ts', additions: 10, deletions: 0 }],
      [],
    );
    const split = buildSplitSuggestion(groups);
    expect(split.too_big).toBe(false);
    expect(split.total_lines).toBe(10);
    expect(split.proposed_splits).toEqual([]);
  });

  it('over the line threshold → too_big with directory-prefix splits + generated bucket', () => {
    const big: FileRow[] = [
      { path: 'src/api/a.ts', additions: 200, deletions: 0 },
      { path: 'src/api/b.ts', additions: 150, deletions: 0 },
      { path: 'src/db/c.ts', additions: 60, deletions: 0 },
      { path: 'src/db/d.ts', additions: 40, deletions: 0 },
      { path: 'pnpm-lock.yaml', additions: 90, deletions: 10 },
    ];
    const groups = buildGroups(big, []);
    const split = buildSplitSuggestion(groups);
    expect(split.too_big).toBe(true);
    expect(split.total_lines).toBeGreaterThan(SPLIT_TOO_BIG_LINES);
    // directory-prefix names, never prose
    const names = split.proposed_splits.map((s) => s.name);
    expect(names).toContain('src/api');
    expect(names).toContain('src/db');
    // boilerplate appended as a `generated` split
    expect(names).toContain('generated');
    expect(split.proposed_splits.find((s) => s.name === 'generated')!.files).toEqual([
      'pnpm-lock.yaml',
    ]);
  });
});

describe('SmartDiff.parse does not throw on the service output shape', () => {
  it('parses a built response', () => {
    const groups = buildGroups(FILES, []);
    const split_suggestion = buildSplitSuggestion(groups);
    expect(() => SmartDiff.parse({ groups, split_suggestion })).not.toThrow();
  });
});
