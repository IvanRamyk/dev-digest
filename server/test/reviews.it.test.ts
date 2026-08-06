import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * A unified diff touching src/config.ts (line 11 added) so grounding can keep a
 * finding on line 11 and drop one on line 999 / a non-existent file.
 */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** A Review fixture: one valid finding (line 11), one hallucinated (line 999). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line does not exist in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
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
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting. Closes #471.',
    })
    .returning();
  // persist the patch so the reviewer can reconstruct a diff (MockGit also returns one)
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('A2 reviews + agents (Testcontainers pg)', () => {
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

  function appWith(structured: unknown, provider: 'openai' | 'anthropic' = 'openai') {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          [provider]: new MockLLMProvider(provider, { structured }),
        },
      },
    });
  }

  it('agents CRUD', async () => {
    const app = await appWith(REVIEW_FIXTURE);

    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Test Reviewer',
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
      },
    });
    expect(created.statusCode).toBe(201);
    const agent = created.json();
    expect(agent.version).toBe(1);

    const list = (await app.inject({ method: 'GET', url: '/agents' })).json();
    expect(list.some((a: { id: string }) => a.id === agent.id)).toBe(true);

    // a config change bumps version
    const updated = (
      await app.inject({
        method: 'PUT',
        url: `/agents/${agent.id}`,
        payload: { system_prompt: 'Updated prompt.' },
      })
    ).json();
    expect(updated.version).toBe(2);

    await app.close();
  });

  it('runs a review: map-reduce + grounding drops the hallucinated finding, keeps the valid one', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.runs).toHaveLength(1);

    // runReview is fire-and-forget: wait for the background run, then read the
    // persisted reviews (the POST returns runIds, not the reviews themselves).
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews).toHaveLength(1);

    const review = reviews[0];
    expect(review.verdict).toBe('request_changes');
    // Score is derived from the GROUNDED findings, not the model's self-reported
    // 42: grounding keeps one CRITICAL (line 11) ⇒ 100 − 35 = 65.
    expect(review.score).toBe(65);
    // grounding kept only the valid finding (line 11), dropped the line-999 one
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0].file).toBe('src/config.ts');
    expect(review.findings[0].start_line).toBe(11);

    // a run_traces document was written (single doc)
    const runId = body.runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.config.model).toBe('gpt-4.1');
    expect(trace.stats.grounding).toBe('1/2 passed');
    expect(trace.log.length).toBeGreaterThan(0);
    // Cost survives into the trace (MockLLMProvider bills a flat 0.001/call).
    expect(trace.stats.cost_usd).toBe(0.001);

    // agent_runs row populated for A5 to aggregate
    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    expect(run!.findingsCount).toBe(1);
    expect(run!.grounding).toBe('1/2 passed');
    // The engine computes cost and the executor must PERSIST it, not drop it.
    expect(run!.costUsd).toBe(0.001);

    await app.close();
  });

  it('PR list totals the cost across agents, superseding each agent\'s earlier runs', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Cost', provider: 'openai', model: 'gpt-4.1', system_prompt: 'cost' },
      })
    ).json();
    const costOf = async () => {
      const listed = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
      return listed.find((p: { id: string }) => p.id === pr.id).cost_usd;
    };
    const runAt = (values: { agentId: string | null; costUsd: number | null; offsetMs: number }) =>
      pg.handle.db.insert(t.agentRuns).values({
        workspaceId,
        agentId: values.agentId,
        prId: pr.id,
        provider: 'openai',
        model: 'gpt-4.1',
        status: values.costUsd == null ? 'failed' : 'done',
        costUsd: values.costUsd,
        ranAt: new Date(Date.now() + values.offsetMs),
      });

    // One real run through the pipeline (MockLLMProvider bills a flat 0.001).
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(await costOf()).toBe(0.001);

    // A SECOND agent's run ADDS to the total — reviewing with N agents costs N runs.
    const other = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Cost2', provider: 'openai', model: 'gpt-4.1', system_prompt: 'cost' },
      })
    ).json();
    await runAt({ agentId: other.id, costUsd: 0.002, offsetMs: 10_000 });
    expect(await costOf()).toBe(0.003);

    // Re-running the FIRST agent SUPERSEDES its own earlier run (0.001 → 0.005),
    // so the total tracks the current review instead of growing with every retry.
    await runAt({ agentId: agent.id, costUsd: 0.005, offsetMs: 20_000 });
    expect(await costOf()).toBe(0.007);

    // A newer UNPRICED run (the shape a failed run persists) DROPS that agent's
    // contribution rather than falling through to its own older 0.005: a
    // superseded run describes an attempt that no longer exists. The other
    // agent's 0.002 is untouched, so the column reads 0.002, not null and not
    // 0.007. (Revised 2026-08-06; the original rule fell through — see
    // specs/run-cost-badge.md.)
    await runAt({ agentId: agent.id, costUsd: null, offsetMs: 30_000 });
    expect(await costOf()).toBe(0.002);

    // Re-running that agent successfully brings its contribution back.
    await runAt({ agentId: agent.id, costUsd: 0.004, offsetMs: 40_000 });
    expect(await costOf()).toBe(0.006);

    await app.close();
  });

  it('PR list reports null cost when EVERY agent\'s newest run is unpriced — not 0', async () => {
    // Guards the "null is not free" rule through the new no-fall-through path:
    // the map key must only be created on a real contribution.
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Unpriced', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    const costOf = async () => {
      const listed = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
      return listed.find((p: { id: string }) => p.id === pr.id).cost_usd;
    };
    const runAt = (values: { costUsd: number | null; offsetMs: number }) =>
      pg.handle.db.insert(t.agentRuns).values({
        workspaceId,
        agentId: agent.id,
        prId: pr.id,
        provider: 'openai',
        model: 'gpt-4.1',
        status: values.costUsd == null ? 'failed' : 'done',
        costUsd: values.costUsd,
        ranAt: new Date(Date.now() + values.offsetMs),
      });

    await runAt({ costUsd: 0.003, offsetMs: 0 });
    expect(await costOf()).toBe(0.003);
    await runAt({ costUsd: null, offsetMs: 10_000 });
    expect(await costOf()).toBeNull(); // NOT 0 — "unknown", not "free"
    await app.close();
  });

  it('PR list reports null cost for a PR that was never reviewed — not 0', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const listed = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
    expect(listed.find((p: { id: string }) => p.id === pr.id).cost_usd).toBeNull();
    await app.close();
  });

  it('PR list breaks findings down by severity, superseding each agent\'s earlier review', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sev', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sev' },
      })
    ).json();
    const countsOf = async () => {
      const listed = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
      return listed.find((p: { id: string }) => p.id === pr.id).findings_by_severity;
    };
    /**
     * A run + the review it produced, persisted straight to the DB.
     *
     * The run row is essential, not scaffolding: the aggregate keys on
     * `agent_runs`, so a review with no run behind it is exempt from superseding
     * and would never be replaced. `severities: null` means "this run produced NO
     * review" — the shape a failed / cancelled / still-running run leaves behind.
     */
    const runWith = async (values: {
      agentId: string | null;
      severities: string[] | null;
      offsetMs: number;
      status?: string;
    }) => {
      const [run] = await pg.handle.db
        .insert(t.agentRuns)
        .values({
          workspaceId,
          agentId: values.agentId,
          prId: pr.id,
          provider: 'openai',
          model: 'gpt-4.1',
          status: values.status ?? (values.severities == null ? 'failed' : 'done'),
          ranAt: new Date(Date.now() + values.offsetMs),
        })
        .returning();
      if (values.severities == null) return run!;

      const [review] = await pg.handle.db
        .insert(t.reviews)
        .values({
          workspaceId,
          prId: pr.id,
          agentId: values.agentId,
          runId: run!.id,
          kind: 'review',
          verdict: 'comment',
          score: 70,
          model: 'gpt-4.1',
          createdAt: new Date(Date.now() + values.offsetMs),
        })
        .returning();
      if (values.severities.length > 0) {
        await pg.handle.db.insert(t.findings).values(
          values.severities.map((severity, i) => ({
            reviewId: review!.id,
            file: 'src/config.ts',
            startLine: 11,
            endLine: 11,
            severity,
            category: 'bug',
            title: `extra ${severity} ${i}`,
            rationale: 'seeded directly',
            confidence: 0.9,
          })),
        );
      }
      return run!;
    };

    // One real run through the pipeline. The fixture has a CRITICAL on line 11 and
    // a WARNING on line 999; grounding drops the phantom, so only the CRITICAL is
    // persisted — the counts report what SURVIVED, not what the model claimed.
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(await countsOf()).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });

    // A SECOND agent's review ADDS — two agents finding things is two findings.
    const other = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sev2', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sev' },
      })
    ).json();
    await runWith({ agentId: other.id, severities: ['WARNING', 'SUGGESTION'], offsetMs: 10_000 });
    expect(await countsOf()).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 });

    // Re-running the FIRST agent SUPERSEDES its own earlier review rather than
    // adding to it, so the counts keep describing the current state of the review.
    await runWith({ agentId: agent.id, severities: ['CRITICAL', 'CRITICAL'], offsetMs: 20_000 });
    expect(await countsOf()).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });

    // An unknown severity is dropped, never bucketed: findings.severity is free
    // text, and a fourth key has no contract, colour, or icon.
    await runWith({ agentId: agent.id, severities: ['HIGH'], offsetMs: 30_000 });
    const counts = await countsOf();
    expect(counts).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 1 });
    expect(Object.keys(counts)).toEqual(['CRITICAL', 'WARNING', 'SUGGESTION']);

    await app.close();
  });

  it('PR list drops an agent whose newest run produced no review, instead of resurrecting its older findings', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const mk = (name: string) =>
      app
        .inject({
          method: 'POST',
          url: '/agents',
          payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
        })
        .then((r) => r.json());
    const [a, b] = [await mk('DeadRun'), await mk('Healthy')];
    const countsOf = async () => {
      const listed = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
      return listed.find((p: { id: string }) => p.id === pr.id).findings_by_severity;
    };
    const run = async (values: {
      agentId: string;
      severities: string[] | null;
      offsetMs: number;
      status?: string;
    }) => {
      const [row] = await pg.handle.db
        .insert(t.agentRuns)
        .values({
          workspaceId,
          agentId: values.agentId,
          prId: pr.id,
          provider: 'openai',
          model: 'gpt-4.1',
          status: values.status ?? (values.severities == null ? 'failed' : 'done'),
          ranAt: new Date(Date.now() + values.offsetMs),
        })
        .returning();
      if (values.severities == null) return;
      const [review] = await pg.handle.db
        .insert(t.reviews)
        .values({
          workspaceId,
          prId: pr.id,
          agentId: values.agentId,
          runId: row!.id,
          kind: 'review',
          verdict: 'comment',
          score: 70,
          model: 'gpt-4.1',
          createdAt: new Date(Date.now() + values.offsetMs),
        })
        .returning();
      if (values.severities.length > 0) {
        await pg.handle.db.insert(t.findings).values(
          values.severities.map((severity, i) => ({
            reviewId: review!.id,
            file: 'src/config.ts',
            startLine: 11,
            endLine: 11,
            severity,
            category: 'bug',
            title: `${severity} ${i}`,
            rationale: 'seeded directly',
            confidence: 0.9,
          })),
        );
      }
    };

    // Both agents review successfully.
    await run({ agentId: a.id, severities: ['CRITICAL'], offsetMs: 0 });
    await run({ agentId: b.id, severities: ['WARNING'], offsetMs: 1_000 });
    expect(await countsOf()).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 });

    // Agent A is re-run and the run FAILS — no reviews row is written. A's older
    // CRITICAL must NOT reappear, and B's WARNING must be untouched.
    await run({ agentId: a.id, severities: null, offsetMs: 10_000 });
    expect(await countsOf()).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 0 });

    // A run still in flight behaves the same way: no result yet, so no claim.
    // With BOTH agents' latest runs now review-less, no review survives at all —
    // so this reads null ("never reviewed"), NOT {0,0,0} ("reviewed, and clean").
    // A PR whose every current run failed has no review to call clean.
    await run({ agentId: b.id, severities: null, offsetMs: 20_000, status: 'running' });
    expect(await countsOf()).toBeNull();

    // A successful re-run brings that agent's findings back.
    await run({ agentId: a.id, severities: ['CRITICAL', 'SUGGESTION'], offsetMs: 30_000 });
    expect(await countsOf()).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 1 });

    await app.close();
  });

  it('PR list still counts a review with no run behind it, even when every run failed', async () => {
    // The seeded demo review has agent_id AND run_id NULL (db/seed.ts) and holds
    // the only findings on that PR. Nothing can supersede it — there is no newer
    // run by "its" agent — so it must survive the run-keyed aggregate.
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const countsOf = async () => {
      const listed = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
      return listed.find((p: { id: string }) => p.id === pr.id).findings_by_severity;
    };

    const [seedReview] = await pg.handle.db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr.id,
        agentId: null,
        runId: null,
        kind: 'review',
        verdict: 'request_changes',
        score: 61,
        model: 'seed',
      })
      .returning();
    await pg.handle.db.insert(t.findings).values([
      {
        reviewId: seedReview!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        rationale: 'seeded',
        confidence: 0.98,
      },
      {
        reviewId: seedReview!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query',
        rationale: 'seeded',
        confidence: 0.86,
      },
    ]);
    expect(await countsOf()).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 });

    // A real agent whose run fails must not erase the run-less review's findings.
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Failing', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    await pg.handle.db.insert(t.agentRuns).values({
      workspaceId,
      agentId: agent.id,
      prId: pr.id,
      provider: 'openai',
      model: 'gpt-4.1',
      status: 'failed',
      ranAt: new Date(Date.now() + 10_000),
    });
    expect(await countsOf()).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 0 });

    await app.close();
  });

  it('PR list distinguishes never-reviewed (null) from reviewed-and-clean ({0,0,0})', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { repo, pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const countsOf = async () => {
      const listed = (await app.inject({ method: 'GET', url: `/repos/${repo.id}/pulls` })).json();
      return listed.find((p: { id: string }) => p.id === pr.id).findings_by_severity;
    };

    // Never reviewed → null. A clean PR must not be indistinguishable from this.
    expect(await countsOf()).toBeNull();

    // A PR with RUNS but no review is still "never reviewed" → null. A run that
    // failed / was cancelled / is in flight writes no reviews row, and a run on
    // its own must not make the PR read as reviewed-and-clean: the entry is
    // created by a REVIEW, never by a run.
    await pg.handle.db.insert(t.agentRuns).values([
      {
        workspaceId,
        agentId: null,
        prId: pr.id,
        provider: 'openai',
        model: 'gpt-4.1',
        status: 'failed',
      },
      {
        workspaceId,
        agentId: null,
        prId: pr.id,
        provider: 'openai',
        model: 'gpt-4.1',
        status: 'running',
      },
    ]);
    expect(await countsOf()).toBeNull();

    // A review that found NOTHING → all zeros. The LEFT JOIN is what preserves
    // this distinction: a findings-less review still yields a row.
    await pg.handle.db.insert(t.reviews).values({
      workspaceId,
      prId: pr.id,
      agentId: null,
      kind: 'review',
      verdict: 'approve',
      score: 100,
      model: 'gpt-4.1',
    });
    expect(await countsOf()).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });

    await app.close();
  });

  it('dual-provider structured output: anthropic provider returns the same Review shape', async () => {
    const app = await appWith(REVIEW_FIXTURE, 'anthropic');
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Claude Rev', provider: 'anthropic', model: 'claude-x', system_prompt: 'rev' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    expect(reviews[0].findings).toHaveLength(1);
    expect(reviews[0].model).toBe('claude-x');
    await app.close();
  });

  it('finding actions: accept, dismiss', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'ActAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const reviews = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/reviews` })
    ).json();
    const findingId = reviews[0].findings[0].id;

    const accepted = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/accept` })
    ).json();
    expect(accepted.finding.accepted_at).not.toBeNull();

    const dismissed = (
      await app.inject({ method: 'POST', url: `/findings/${findingId}/dismiss` })
    ).json();
    expect(dismissed.finding.dismissed_at).not.toBeNull();
    expect(dismissed.finding.accepted_at).toBeNull();

    await app.close();
  });

  it('SSE: /runs/:id/events streams events and completes', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'SseAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 's' },
      })
    ).json();
    // The run is synchronous; events are buffered on the bus. Subscribing after
    // the run still replays the buffer (replay-first semantics), then completes.
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json();
    const runId = body.runs[0].run_id;

    const sse = await app.inject({ method: 'GET', url: `/runs/${runId}/events` });
    expect(sse.statusCode).toBe(200);
    expect(sse.headers['content-type']).toContain('text/event-stream');
    // The replay buffer should contain our log lines as SSE `data:` frames.
    expect(sse.payload).toContain('Starting review');
    expect(sse.payload).toContain('Citation grounding');
    await app.close();
  });

  it('run all enabled agents reviews with each enabled agent', async () => {
    const app = await appWith(REVIEW_FIXTURE);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { all: true } })
    ).json();
    // seed has 2 enabled agents; we may have created more above in this PR's ws.
    expect(body.runs.length).toBeGreaterThanOrEqual(2);
    await app.close();
  });
});
