import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { FakeRepoIntel } from './helpers/fake-repo-intel.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { LLMProvider } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions-scan] Docker not available — skipping integration tests.');
}

const A_TS = ['const x = 1;', 'fetchThing().then(v => use(v));', 'return x;'].join('\n');
const B_TS = 'fetchThing().then(v => use(v));';
const TSCONFIG = JSON.stringify({ compilerOptions: { strict: true } });

class ThrowingLLMProvider implements LLMProvider {
  readonly id = 'openai' as const;
  listModels() {
    return Promise.resolve([]);
  }
  complete(): never {
    throw new Error('down');
  }
  completeStructured(): never {
    throw new Error('down');
  }
  embed() {
    return Promise.resolve([]);
  }
}

d('conventions scan pipeline (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    const seeded = await seed(pg.handle.db);
    workspaceId = seeded.workspaceId;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makeRepo(fullName: string, files: Record<string, string>) {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: fullName.split('/')[0]!, name: fullName.split('/')[1]!, fullName, clonePath: '/mock/cloned' })
      .returning();
    return { repoId: repo!.id, git: new MockGitClient({ files }) };
  }

  function makeApp(overrides: Parameters<typeof buildApp>[0]['overrides']) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({ config, db: pg.handle.db, overrides });
  }

  it('happy path: config rule + pattern-verified rule + self-healed evidence + hallucinated path dropped', async () => {
    const { repoId, git } = await makeRepo('acme/scan-happy', {
      'tsconfig.json': TSCONFIG,
      'src/a.ts': A_TS,
      'src/b.ts': B_TS,
    });
    const repoIntel = new FakeRepoIntel(['src/a.ts', 'src/b.ts']);
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
          candidates: [
            {
              rule: 'Use .then() chains for this async API',
              category: 'other',
              evidence_path: 'src/a.ts',
              evidence_start_line: 2,
              evidence_end_line: 2,
              evidence_snippet: 'fetchThing().then(v => use(v));',
              verifiable: 'pattern',
              support_pattern: '$A.then($B)',
              violation_pattern: null,
            },
            {
              rule: 'Declare constants before use',
              category: 'other',
              evidence_path: 'src/a.ts',
              evidence_start_line: 100, // wildly off — self-heals to the real line
              evidence_end_line: 100,
              evidence_snippet: 'const x = 1;',
              verifiable: 'semantic',
              support_pattern: null,
              violation_pattern: null,
            },
            {
              rule: 'A rule about a file that does not exist',
              category: 'other',
              evidence_path: 'src/does-not-exist.ts',
              evidence_start_line: 1,
              evidence_end_line: 1,
              evidence_snippet: 'this text is not real',
              verifiable: 'semantic',
              support_pattern: null,
              violation_pattern: null,
            },
          ],
        },
        ConventionJudgement: {
          verdicts: [{ file: 'src/b.ts', verdict: 'follows', reason: 'ok' }],
        },
      },
    });

    const app = await makeApp({ git, repoIntel, llm: { openai: llm } });
    const started = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
    expect(started.statusCode).toBe(202);
    const scanId = started.json().scan_id;

    await app.container.jobs.onIdle();

    const view = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(view.statusCode).toBe(200);
    const body = view.json();
    expect(body.scan.id).toBe(scanId);
    expect(body.scan.status).toBe('done');

    const rules: Record<string, (typeof body.candidates)[number]> = {};
    for (const c of body.candidates) rules[c.rule] = c;

    // config rule, confidence exactly 1
    const configRule = Object.values(rules).find((c) => c.source === 'config');
    expect(configRule).toBeDefined();
    expect(configRule!.verification).toBe('config');
    expect(configRule!.confidence).toBe(1);

    // pattern rule: confidence is the COMPUTED ratio (2 files support / (2+0+1)), never model-reported
    const patternRule = rules['Use .then() chains for this async API'];
    expect(patternRule).toBeDefined();
    expect(patternRule.verification).toBe('pattern');
    expect(patternRule.support_count).toBe(2);
    expect(patternRule.confidence).toBeCloseTo(2 / 3);

    // self-healed evidence: persisted line is the REAL line, not the model's claimed 100
    const healedRule = rules['Declare constants before use'];
    expect(healedRule).toBeDefined();
    expect(healedRule.evidence_start_line).toBe(1);
    expect(healedRule.evidence_snippet).toBe('const x = 1;');

    // hallucinated path: absent entirely
    expect(rules['A rule about a file that does not exist']).toBeUndefined();

    await app.close();
  });

  it('getConventionSamples → [] and no grep fallback → done + no_samples + zero LLM calls', async () => {
    const { repoId, git } = await makeRepo('acme/scan-nosamples', {});
    const repoIntel = new FakeRepoIntel([]);
    const llm = new MockLLMProvider('openai');
    const app = await makeApp({ git, repoIntel, llm: { openai: llm } });

    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
    await app.container.jobs.onIdle();

    const scan = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions/scan` })).json();
    expect(scan.status).toBe('done');
    expect(scan.degraded_reason).toBe('no_samples');
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });

  it('container.llm throwing → failed/no_api_key, job resolves, config rules survive', async () => {
    const { repoId, git } = await makeRepo('acme/scan-nokey', {
      'tsconfig.json': TSCONFIG,
      'src/a.ts': A_TS,
    });
    const repoIntel = new FakeRepoIntel(['src/a.ts']);
    const app = await makeApp({ git, repoIntel, llm: { openai: new ThrowingLLMProvider() } });

    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
    await app.container.jobs.onIdle();

    const scan = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions/scan` })).json();
    expect(scan.status).toBe('failed');
    expect(scan.error).toBe('no_api_key');

    const view = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    expect(view.candidates.some((c: { source: string }) => c.source === 'config')).toBe(true);

    await app.close();
  });

  it('double POST returns the same scan_id (double-click guard)', async () => {
    const { repoId, git } = await makeRepo('acme/scan-double', { 'src/a.ts': A_TS });
    const repoIntel = new FakeRepoIntel(['src/a.ts']);
    const llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: { candidates: [] } } });
    const app = await makeApp({ git, repoIntel, llm: { openai: llm } });

    const first = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
    const second = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
    expect(second.json().scan_id).toBe(first.json().scan_id);

    await app.container.jobs.onIdle();
    await app.close();
  });

  it('support=1 pattern is refuted (absent), an uncompilable pattern falls through to the judge', async () => {
    // src/c.ts has no `.then()` at all — a neighbour file for the judge to see,
    // without contributing a second match to the `$A.then($B)` support count.
    const { repoId, git } = await makeRepo('acme/scan-refute', { 'src/a.ts': A_TS, 'src/c.ts': 'const y = 2;' });
    const repoIntel = new FakeRepoIntel(['src/a.ts', 'src/c.ts']);
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
          candidates: [
            {
              rule: 'Solo pattern match, refuted',
              category: 'other',
              evidence_path: 'src/a.ts',
              evidence_start_line: 2,
              evidence_end_line: 2,
              evidence_snippet: 'fetchThing().then(v => use(v));',
              verifiable: 'pattern',
              support_pattern: '$A.then($B)', // matches only src/a.ts in this fixture (1 file) → refuted
              violation_pattern: null,
            },
            {
              rule: 'Bad pattern falls through to the judge',
              category: 'other',
              evidence_path: 'src/a.ts',
              evidence_start_line: 2,
              evidence_end_line: 2,
              evidence_snippet: 'fetchThing().then(v => use(v));',
              verifiable: 'pattern',
              support_pattern: ')))not a real pattern(((',
              violation_pattern: null,
            },
          ],
        },
        ConventionJudgement: { verdicts: [{ file: 'src/a.ts', verdict: 'follows', reason: 'ok' }] },
      },
    });
    const app = await makeApp({ git, repoIntel, llm: { openai: llm } });

    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
    await app.container.jobs.onIdle();

    const view = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    const rules: Record<string, unknown> = {};
    for (const c of view.candidates as Array<{ rule: string }>) rules[c.rule] = c;
    expect(rules['Solo pattern match, refuted']).toBeUndefined();
    expect((rules['Bad pattern falls through to the judge'] as { verification: string } | undefined)?.verification).toBe(
      'semantic',
    );

    await app.close();
  });

  it('9 semantic rules with MAX_JUDGE_CALLS=8: the 9th lands unverified at confidence 0.3 and is still persisted', async () => {
    const { repoId, git } = await makeRepo('acme/scan-budget', { 'src/a.ts': A_TS, 'src/b.ts': B_TS });
    const repoIntel = new FakeRepoIntel(['src/a.ts', 'src/b.ts']);
    const candidates = Array.from({ length: 9 }, (_, i) => ({
      rule: `Rule ${i + 1} about async patterns`,
      category: 'other',
      evidence_path: 'src/a.ts',
      evidence_start_line: 2,
      evidence_end_line: 2,
      evidence_snippet: 'fetchThing().then(v => use(v));',
      verifiable: 'semantic',
      support_pattern: null,
      violation_pattern: null,
    }));
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: { candidates },
        ConventionJudgement: { verdicts: [{ file: 'src/a.ts', verdict: 'follows', reason: 'ok' }] },
      },
    });
    const app = await makeApp({ git, repoIntel, llm: { openai: llm } });

    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
    await app.container.jobs.onIdle();

    const judgeCalls = llm.calls.filter(
      (c) => c.method === 'completeStructured' && (c.req as { schemaName: string }).schemaName === 'ConventionJudgement',
    );
    expect(judgeCalls).toHaveLength(8);

    const view = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    const ninth = (view.candidates as Array<{ rule: string; verification: string; confidence: number }>).find(
      (c) => c.rule === 'Rule 9 about async patterns',
    );
    expect(ninth).toBeDefined();
    expect(ninth!.verification).toBe('unverified');
    expect(ninth!.confidence).toBe(0.3);

    await app.close();
  });

  it('a judge call that throws still lands the rule unverified — the scan is NOT failed', async () => {
    const { repoId, git } = await makeRepo('acme/scan-judge-throws', { 'src/a.ts': A_TS, 'src/b.ts': B_TS });
    const repoIntel = new FakeRepoIntel(['src/a.ts', 'src/b.ts']);
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
          candidates: [
            {
              rule: 'A semantic rule whose judge call will throw',
              category: 'other',
              evidence_path: 'src/a.ts',
              evidence_start_line: 2,
              evidence_end_line: 2,
              evidence_snippet: 'fetchThing().then(v => use(v));',
              verifiable: 'semantic',
              support_pattern: null,
              violation_pattern: null,
            },
          ],
        },
        // No ConventionJudgement fixture registered → MockLLMProvider throws
        // (schema validation against the default `{}` fixture fails).
      },
    });
    const app = await makeApp({ git, repoIntel, llm: { openai: llm } });

    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
    await app.container.jobs.onIdle();

    const scan = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions/scan` })).json();
    expect(scan.status).toBe('done');

    const view = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    const rule = (view.candidates as Array<{ rule: string; verification: string }>).find(
      (c) => c.rule === 'A semantic rule whose judge call will throw',
    );
    expect(rule?.verification).toBe('unverified');

    await app.close();
  });
});
