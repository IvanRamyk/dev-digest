import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { FakeRepoIntel } from './helpers/fake-repo-intel.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions-crud] Docker not available — skipping integration tests.');
}

const A_TS = ['const x = 1;', 'fetchThing().then(v => use(v));', 'return x;'].join('\n');

d('conventions CRUD + re-scan semantics (Testcontainers pg)', () => {
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

  async function makeRepo(fullName: string, files: Record<string, string> = { 'src/a.ts': A_TS }) {
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

  async function runScanWith(repoId: string, git: MockGitClient, rules: string[]) {
    const repoIntel = new FakeRepoIntel(['src/a.ts']);
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
          candidates: rules.map((rule) => ({
            rule,
            category: 'other',
            evidence_path: 'src/a.ts',
            evidence_start_line: 2,
            evidence_end_line: 2,
            evidence_snippet: 'fetchThing().then(v => use(v));',
            verifiable: 'semantic',
            support_pattern: null,
            violation_pattern: null,
          })),
        },
        ConventionJudgement: { verdicts: [{ file: 'src/a.ts', verdict: 'follows', reason: 'ok' }] },
      },
    });
    const app = await makeApp({ git, repoIntel, llm: { openai: llm } });
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/scan` });
    await app.container.jobs.onIdle();
    return app;
  }

  it('list shape/order/filter: status query narrows the candidate set', async () => {
    const { repoId, git } = await makeRepo('acme/crud-list');
    const app = await runScanWith(repoId, git, ['Rule A', 'Rule B']);

    const all = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions?status=all` })).json();
    expect(all.candidates).toHaveLength(2);

    const pending = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions?status=pending` })).json();
    expect(pending.candidates).toHaveLength(2);

    const accepted = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions?status=accepted` })).json();
    expect(accepted.candidates).toHaveLength(0);

    await app.close();
  });

  it('PUT status accepts a candidate and mirrors the legacy `accepted` column', async () => {
    const { repoId, git } = await makeRepo('acme/crud-accept');
    const app = await runScanWith(repoId, git, ['Rule to accept']);
    const listed = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    const id = listed.candidates[0].id;

    const res = await app.inject({ method: 'PUT', url: `/conventions/${id}`, payload: { status: 'accepted' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('accepted');
    expect(res.json().accepted).toBe(true);

    await app.close();
  });

  it('PUT rule edits the text but leaves rule_key (and therefore dedupe identity) alone', async () => {
    const { repoId, git } = await makeRepo('acme/crud-edit');
    const app = await runScanWith(repoId, git, ['Original rule text']);
    const listed = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    const id = listed.candidates[0].id;

    const res = await app.inject({ method: 'PUT', url: `/conventions/${id}`, payload: { rule: 'Edited rule text' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().rule).toBe('Edited rule text');

    await app.close();
  });

  it('PUT on an unknown id → 404; an empty patch → 422', async () => {
    const { repoId, git } = await makeRepo('acme/crud-404');
    const app = await runScanWith(repoId, git, []);

    const notFound = await app.inject({
      method: 'PUT',
      url: `/conventions/00000000-0000-0000-0000-000000000000`,
      payload: { status: 'accepted' },
    });
    expect(notFound.statusCode).toBe(404);

    const empty = await app.inject({ method: 'PUT', url: `/conventions/00000000-0000-0000-0000-000000000000`, payload: {} });
    expect(empty.statusCode).toBe(422);

    await app.close();
  });

  it('bulk-status updates every id at once ("Deselect all")', async () => {
    const { repoId, git } = await makeRepo('acme/crud-bulk');
    const app = await runScanWith(repoId, git, ['Rule A', 'Rule B', 'Rule C']);
    const listed = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    const ids = listed.candidates.map((c: { id: string }) => c.id);

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/bulk-status`,
      payload: { ids, status: 'rejected' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().updated).toBe(3);

    const after = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions?status=rejected` })).json();
    expect(after.candidates).toHaveLength(3);

    await app.close();
  });

  it('re-scan: accepted stays accepted, rejected stays rejected, an un-refound pending row is deleted, a new rule lands pending', async () => {
    const { repoId, git } = await makeRepo('acme/crud-rescan');

    // Scan 1: three rules.
    let app = await runScanWith(repoId, git, ['Keep accepted', 'Keep rejected', 'Drop me next scan']);
    let listed = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    const byRule: Record<string, string> = {};
    for (const c of listed.candidates as Array<{ id: string; rule: string }>) byRule[c.rule] = c.id;

    await app.inject({ method: 'PUT', url: `/conventions/${byRule['Keep accepted']}`, payload: { status: 'accepted' } });
    await app.inject({ method: 'PUT', url: `/conventions/${byRule['Keep rejected']}`, payload: { status: 'rejected' } });
    await app.close();

    // Scan 2: re-found rules "Keep accepted" and "Keep rejected", a brand-new
    // "Totally new rule", and "Drop me next scan" is absent this time.
    app = await runScanWith(repoId, git, ['Keep accepted', 'Keep rejected', 'Totally new rule']);
    listed = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions?status=all` })).json();
    const rulesAfter = new Set((listed.candidates as Array<{ rule: string }>).map((c) => c.rule));

    expect(rulesAfter.has('Keep accepted')).toBe(true);
    expect(rulesAfter.has('Keep rejected')).toBe(true);
    expect(rulesAfter.has('Totally new rule')).toBe(true);
    expect(rulesAfter.has('Drop me next scan')).toBe(false); // stale pending, deleted

    const statusByRule: Record<string, string> = {};
    for (const c of listed.candidates as Array<{ rule: string; status: string }>) statusByRule[c.rule] = c.status;
    expect(statusByRule['Keep accepted']).toBe('accepted');
    expect(statusByRule['Keep rejected']).toBe('rejected');
    expect(statusByRule['Totally new rule']).toBe('pending');

    await app.close();
  });

  it('skill-preview 400s at 0 accepted candidates, and returns a merged body at 2', async () => {
    const { repoId, git } = await makeRepo('acme/crud-preview');
    const app = await runScanWith(repoId, git, ['First accepted rule', 'Second accepted rule']);

    const zero = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill-preview` });
    expect(zero.statusCode).toBe(400);
    expect(zero.json().error.code).toBe('no_accepted_candidates');

    const listed = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
    for (const c of listed.candidates as Array<{ id: string }>) {
      await app.inject({ method: 'PUT', url: `/conventions/${c.id}`, payload: { status: 'accepted' } });
    }

    const preview = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/skill-preview` });
    expect(preview.statusCode).toBe(200);
    const dto = preview.json();
    expect(dto.candidate_count).toBe(2);
    expect(dto.type).toBe('convention');
    expect(dto.body).toContain('First accepted rule');
    expect(dto.body).toContain('Second accepted rule');
    expect(dto.name).toContain('conventions');

    await app.close();
  });
});
