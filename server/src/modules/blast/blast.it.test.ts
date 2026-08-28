import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import * as t from '../../db/schema.js';
import { BlastRadius } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;

/** A repo + PR + a two-file changed set (no code index built → degraded path). */
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `blast-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 601,
      title: 'Refactor billing',
      author: 'marisa.koch',
      branch: 'feat/billing',
      base: 'main',
      headSha: 'blastsha1',
      additions: 12,
      deletions: 3,
      filesCount: 2,
      status: 'needs_review',
    })
    .returning();
  await db.insert(t.prFiles).values([
    { prId: pr!.id, path: 'src/billing.ts', additions: 8, deletions: 2 },
    { prId: pr!.id, path: 'src/invoice.ts', additions: 4, deletions: 1 },
  ]);
  return { repo: repo!, pr: pr! };
}

d('blast endpoint (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  // Injected so we can assert the summary flag makes ZERO LLM calls when off.
  let mockLlm: MockLLMProvider;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const app = () => {
    mockLlm = new MockLLMProvider('openai');
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        llm: { openai: mockLlm, anthropic: mockLlm, openrouter: mockLlm },
      },
    });
  };

  it('returns a valid BlastRadius; an unindexed repo reports index_state.status !== full', async () => {
    const a = await app();
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const res = await a.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });
    expect(res.statusCode).toBe(200);
    const blast = BlastRadius.parse(res.json());
    // An unindexed repo has no clone path → the facade degrades, and getIndexState
    // reports a non-full status. Arrays are empty but NOT masking a real index.
    expect(blast.index_state.status).not.toBe('full');
    expect(Array.isArray(blast.changed_symbols)).toBe(true);
    expect(Array.isArray(blast.downstream)).toBe(true);
    // Summary flag is off by default → no LLM call was made.
    expect(mockLlm.calls).toHaveLength(0);
    await a.close();
  });

  it('unknown uuid → 404', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/pulls/${crypto.randomUUID()}/blast` });
    expect(res.statusCode).toBe(404);
    await a.close();
  });

  it('malformed id → 422', async () => {
    const a = await app();
    const res = await a.inject({ method: 'GET', url: `/pulls/not-a-uuid/blast` });
    expect(res.statusCode).toBe(422);
    await a.close();
  });
});
