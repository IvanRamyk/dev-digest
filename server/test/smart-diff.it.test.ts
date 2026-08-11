import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SmartDiff } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;

/** A repo + PR + a fixed 3-file diff (one core, one wiring, one boilerplate). */
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string, opts?: { files?: boolean }) {
  const name = `payments-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 88,
      deletions: 0,
      filesCount: 3,
      status: 'needs_review',
    })
    .returning();
  if (opts?.files !== false) {
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'package.json', additions: 2, deletions: 0 },
      { prId: pr!.id, path: 'pnpm-lock.yaml', additions: 82, deletions: 0 },
    ]);
  }
  return { repo: repo!, pr: pr! };
}

/**
 * Build a run-based finding fixture: an `agent_runs` row FIRST, then a `reviews`
 * row carrying that run's id, then the findings. `server/INSIGHTS.md` 2026-08-06
 * records that a bare review with an agentId but no runId is a shape production
 * never creates — so fixtures must be run-first or they prove nothing about
 * superseding.
 */
async function addRun(
  db: PgFixture['handle']['db'],
  args: {
    workspaceId: string;
    prId: string;
    agentId: string | null;
    ranAt: Date;
    status: 'done' | 'failed';
    findings?: { file: string; startLine: number; endLine: number; severity: string }[];
  },
) {
  const [run] = await db
    .insert(t.agentRuns)
    .values({
      workspaceId: args.workspaceId,
      agentId: args.agentId,
      prId: args.prId,
      status: args.status,
      ranAt: args.ranAt,
      provider: 'openai',
      model: 'gpt-4.1',
    })
    .returning();
  // A failed run persists NO review (insertReview only runs on the success path).
  if (args.status === 'failed') return run!;
  const [review] = await db
    .insert(t.reviews)
    .values({
      workspaceId: args.workspaceId,
      prId: args.prId,
      agentId: args.agentId,
      runId: run!.id,
      kind: 'review',
      verdict: 'request_changes',
      model: 'gpt-4.1',
    })
    .returning();
  for (const f of args.findings ?? []) {
    await db.insert(t.findings).values({
      reviewId: review!.id,
      file: f.file,
      startLine: f.startLine,
      endLine: f.endLine,
      severity: f.severity,
      category: 'bug',
      title: 'x',
      rationale: 'x',
      confidence: 0.9,
    });
  }
  return run!;
}

d('smart-diff endpoint (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const app = () => buildApp({ config: config(), db: pg.handle.db, overrides: {} });

  it('no review → three groups, every finding_lines empty', async () => {
    const a = await app();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const sd = SmartDiff.parse(res.json());
    expect(sd.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    for (const g of sd.groups) for (const f of g.files) expect(f.finding_lines).toEqual([]);
    // classification: config.ts → core, package.json → wiring, lockfile → boilerplate
    expect(sd.groups[0]!.files.map((f) => f.path)).toEqual(['src/config.ts']);
    expect(sd.groups[1]!.files.map((f) => f.path)).toEqual(['package.json']);
    expect(sd.groups[2]!.files.map((f) => f.path)).toEqual(['pnpm-lock.yaml']);
    await a.close();
  });

  it('after a review → right lines on the right file', async () => {
    const a = await app();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await addRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: null,
      ranAt: new Date(),
      status: 'done',
      findings: [{ file: 'src/config.ts', startLine: 12, endLine: 12, severity: 'CRITICAL' }],
    });
    const sd = SmartDiff.parse((await a.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })).json());
    const core = sd.groups.find((g) => g.role === 'core')!;
    expect(core.files.find((f) => f.path === 'src/config.ts')!.finding_lines).toEqual([12]);
    await a.close();
  });

  it('re-run → old findings gone, new ones shown', async () => {
    const a = await app();
    // Use a real seeded agent id to satisfy the agent_runs FK.
    const [agent] = await pg.handle.db.select().from(t.agents).limit(1);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    await addRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agent!.id,
      ranAt: new Date(Date.now() - 10_000),
      status: 'done',
      findings: [{ file: 'src/config.ts', startLine: 12, endLine: 12, severity: 'CRITICAL' }],
    });
    // re-run the SAME agent: new finding on a different line supersedes the old.
    await addRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agent!.id,
      ranAt: new Date(),
      status: 'done',
      findings: [{ file: 'src/config.ts', startLine: 30, endLine: 30, severity: 'WARNING' }],
    });
    const sd = SmartDiff.parse((await a.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })).json());
    const core = sd.groups.find((g) => g.role === 'core')!;
    expect(core.files.find((f) => f.path === 'src/config.ts')!.finding_lines).toEqual([30]);
    await a.close();
  });

  it('failed newest run → that agent silent, others unaffected', async () => {
    const a = await app();
    const [agentA, agentB] = await pg.handle.db.select().from(t.agents).limit(2);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    // agent A: an older successful run, then a newer failed run → A goes silent.
    await addRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agentA!.id,
      ranAt: new Date(Date.now() - 10_000),
      status: 'done',
      findings: [{ file: 'src/config.ts', startLine: 12, endLine: 12, severity: 'CRITICAL' }],
    });
    await addRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agentA!.id,
      ranAt: new Date(),
      status: 'failed',
    });
    // agent B: a successful run → unaffected.
    await addRun(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agentB!.id,
      ranAt: new Date(),
      status: 'done',
      findings: [{ file: 'src/config.ts', startLine: 40, endLine: 40, severity: 'WARNING' }],
    });
    const sd = SmartDiff.parse((await a.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })).json());
    const core = sd.groups.find((g) => g.role === 'core')!;
    // A's line 12 is suppressed; only B's line 40 survives.
    expect(core.files.find((f) => f.path === 'src/config.ts')!.finding_lines).toEqual([40]);
    await a.close();
  });

  it('run-less review is always counted', async () => {
    const a = await app();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr.id, kind: 'review', model: 'seed' })
      .returning();
    await pg.handle.db.insert(t.findings).values({
      reviewId: review!.id,
      file: 'src/config.ts',
      startLine: 5,
      endLine: 5,
      severity: 'CRITICAL',
      category: 'security',
      title: 'x',
      rationale: 'x',
      confidence: 0.9,
    });
    const sd = SmartDiff.parse((await a.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })).json());
    const core = sd.groups.find((g) => g.role === 'core')!;
    expect(core.files.find((f) => f.path === 'src/config.ts')!.finding_lines).toEqual([5]);
    await a.close();
  });

  it('unknown uuid → 404', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/pulls/${crypto.randomUUID()}/smart-diff` });
    expect(res.statusCode).toBe(404);
    await a.close();
  });

  it('malformed id → 422', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/pulls/not-a-uuid/smart-diff` });
    expect(res.statusCode).toBe(422);
    await a.close();
  });

  it('PR with zero files → 200, three empty groups, not too_big', async () => {
    const a = await app();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, { files: false });
    const sd = SmartDiff.parse((await a.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` })).json());
    expect(sd.groups.every((g) => g.files.length === 0)).toBe(true);
    expect(sd.split_suggestion.total_lines).toBe(0);
    expect(sd.split_suggestion.too_big).toBe(false);
    await a.close();
  });
});
