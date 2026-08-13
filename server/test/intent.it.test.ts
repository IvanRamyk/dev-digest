import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { IntentRepository } from '../src/modules/intent/repository.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Intent } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/middleware/rate-limit.ts b/src/middleware/rate-limit.ts
--- a/src/middleware/rate-limit.ts
+++ b/src/middleware/rate-limit.ts
@@ -1,0 +1,5 @@
+export const limiter = () => {};`;

/** The Intent the mock classifier returns (defaults filled by the schema). */
const INTENT_FIXTURE = {
  intent: 'Add a rate limiter to the public API.',
  in_scope: ['src/middleware/rate-limit.ts'],
  out_of_scope: ['auth', 'billing'],
  confidence: 'high',
};

let repoSeq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string, body: string) {
  const name = `rl-api-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 501,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'headsha1',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body,
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/middleware/rate-limit.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -1,0 +1,5 @@\n+export const limiter = () => {};',
  });
  return { repo: repo!, pr: pr! };
}

d('Intent module (Testcontainers pg)', () => {
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

  function appWith(opts: { repoFiles?: Record<string, string> } = {}) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient({ repoFiles: opts.repoFiles }),
        // review_intent defaults to openrouter/deepseek — inject that provider.
        llm: { openrouter: new MockLLMProvider('openai', { structured: INTENT_FIXTURE }) },
      },
    });
  }

  it('POST derives an Intent and GET reads it back through the widened pr_intent', async () => {
    const app = await appWith();
    const { pr } = await setupPr(pg.handle.db, workspaceId, 'Adds a rate limiter.');

    const posted = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(posted.statusCode).toBe(200);
    const intent = posted.json() as Intent;
    expect(intent.intent).toBe('Add a rate limiter to the public API.');
    expect(intent.in_scope).toContain('src/middleware/rate-limit.ts');
    expect(intent.confidence).toBe('high');
    // The always-present sources: title, body, files.
    expect(intent.sources.map((s) => s.type)).toEqual(
      expect.arrayContaining(['pr_title', 'pr_body', 'files']),
    );

    const got = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(got.statusCode).toBe(200);
    const read = got.json() as Intent;
    expect(read).toEqual(intent);

    // The classifier model was persisted (never a key).
    const [row] = await pg.handle.db
      .select()
      .from(t.prIntent)
      .where(eq(t.prIntent.prId, pr.id));
    expect(row!.model).toBe('deepseek/deepseek-v4-flash');
    expect(row!.derivedAt).toBeInstanceOf(Date);

    await app.close();
  });

  it('GET returns null before any intent is derived', async () => {
    const app = await appWith();
    const { pr } = await setupPr(pg.handle.db, workspaceId, 'no derive yet');
    const got = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toBeNull();
    await app.close();
  });

  it('an empty PR body downgrades confidence to low and marks the body source missing', async () => {
    const app = await appWith();
    const { pr } = await setupPr(pg.handle.db, workspaceId, '');
    const posted = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    const intent = posted.json() as Intent;
    // Fixture said "high", but an empty body forces "low".
    expect(intent.confidence).toBe('low');
    expect(intent.sources.find((s) => s.type === 'pr_body')?.status).toBe('missing');
    await app.close();
  });

  it('an unavailable plan/spec link is recorded missing, never fabricated', async () => {
    // No repoFiles → getRepoFile resolves every allowlisted path to "missing".
    const app = await appWith({ repoFiles: {} });
    const { pr } = await setupPr(
      pg.handle.db,
      workspaceId,
      'Implements specs/rate-limit.md as planned.',
    );
    const posted = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    const intent = posted.json() as Intent;
    const specSource = intent.sources.find((s) => s.ref === 'specs/rate-limit.md');
    expect(specSource?.status).toBe('missing');
    expect(intent.missing_context.join(' ')).toContain('specs/rate-limit.md');
    await app.close();
  });

  it('repository round-trips the widened columns directly', async () => {
    const { pr } = await setupPr(pg.handle.db, workspaceId, 'repo direct');
    const repo = new IntentRepository(pg.handle.db);
    const value: Intent = {
      intent: 'direct write',
      in_scope: ['a'],
      out_of_scope: ['b'],
      confidence: 'medium',
      sources: [{ type: 'issue', ref: '#9', status: 'available' }],
      missing_context: ['nothing'],
    };
    await repo.upsert(pr.id, value, 'some/model');
    expect(await repo.hasIntent(pr.id)).toBe(true);
    const back = await repo.getForPr(pr.id);
    expect(back).toEqual(value);
  });
});
