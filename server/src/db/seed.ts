import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
  API_CONTRACT_REVIEWER_PROMPT,
} from './seed-prompts.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * Course lessons populate the other tables (skills, conventions, memory, eval,
 * …) once their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files — a real 9-file diff so Smart Diff has something to classify:
    // core logic first, then wiring (package.json + a small src/index.ts), then
    // boilerplate collapsed at the bottom (lockfile, bundled output, snapshot).
    // Every row carries a short real patch (the prior seed left them all null).
    await db.insert(t.prFiles).values([
      {
        prId: pr!.id,
        path: 'src/middleware/ratelimit.ts',
        additions: 84,
        deletions: 0,
        patch: `@@ -0,0 +1,8 @@
+import type { Request, Response, NextFunction } from 'express';
+import { TokenBucket } from './token-bucket';
+
+const buckets = new Map<string, TokenBucket>();
+
+export function rateLimit(opts: { rpm: number }) {
+  return (req: Request, res: Response, next: NextFunction) => {
+    const key = req.ip;`,
      },
      {
        prId: pr!.id,
        path: 'src/api/public/webhooks.ts',
        additions: 31,
        deletions: 6,
        patch: `@@ -12,6 +12,9 @@ export async function handleWebhook(req, res) {
-  await process(req.body);
+  if (!rateLimit(req)) {
+    return res.status(429).json({ error: 'rate_limited' });
+  }
+  await process(req.body);`,
      },
      {
        prId: pr!.id,
        path: 'src/config.ts',
        additions: 4,
        deletions: 0,
        patch: `@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: process.env.REDIS_URL,`,
      },
      {
        prId: pr!.id,
        path: 'src/api/users.ts',
        additions: 7,
        deletions: 2,
        patch: `@@ -43,4 +43,9 @@ export async function listUsers(ids: string[]) {
-  return Promise.all(ids.map((id) => db.user(id)));
+  const users = [];
+  for (const id of ids) {
+    users.push(await db.user(id));
+  }
+  return users;`,
      },
      {
        prId: pr!.id,
        path: 'package.json',
        additions: 3,
        deletions: 0,
        patch: `@@ -18,6 +18,9 @@
   "dependencies": {
+    "rate-limiter-flexible": "^5.0.3",
     "express": "^4.19.2",`,
      },
      {
        prId: pr!.id,
        path: 'src/index.ts',
        additions: 2,
        deletions: 0,
        patch: `@@ -8,3 +8,5 @@ const app = express();
+import { rateLimit } from './middleware/ratelimit';
+app.use(rateLimit({ rpm: 60 }));
 app.listen(3000);`,
      },
      {
        prId: pr!.id,
        path: 'pnpm-lock.yaml',
        additions: 92,
        deletions: 24,
        patch: `@@ -1204,6 +1204,12 @@ packages:
+  rate-limiter-flexible@5.0.3:
+    resolution: {integrity: sha512-abc123...}
+  /rate-limiter-flexible@5.0.3:
+    dev: false`,
      },
      {
        prId: pr!.id,
        path: 'dist/bundle.js',
        additions: 140,
        deletions: 118,
        patch: `@@ -1,1 +1,1 @@
-(()=>{"use strict";var e={};})();
+(()=>{"use strict";var e={},t=new Map;})();`,
      },
      {
        prId: pr!.id,
        path: '__snapshots__/api.test.ts.snap',
        additions: 6,
        deletions: 0,
        patch: `@@ -14,0 +14,6 @@
+exports[\`rate limit returns 429\`] = \`
+Object {
+  "error": "rate_limited",
+}
+\`;`,
      },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description: 'Flags uncovered branches, over-mocking, weak assertions, and flake sources.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'API Contract Reviewer',
      description: 'Catches breaking route/DTO signature changes: status codes, nullability, shape drift.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  const agentIdByName = new Map<string, string>();
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (existing) {
      agentIdByName.set(a.name, existing.id);
    } else {
      const [created] = await db.insert(t.agents).values(a).returning();
      agentIdByName.set(a.name, created!.id);
    }
  }

  // ---- L02 — seeded skills, bound to the two new agents ----
  // Skills Lab starts non-empty so `agent_skills` is exercised straight after
  // `pnpm db:seed`; the "at least one skill arrives by import" requirement is
  // satisfied by hand in the UI, not here (see specs/skills.md).
  const seedSkills: Array<{
    values: typeof t.skills.$inferInsert;
    boundTo: string[];
  }> = [
    {
      values: {
        workspaceId,
        name: 'test-coverage-rubric',
        description: 'Scores whether new logic ships with tests that cover its meaningful branches.',
        type: 'rubric',
        source: 'manual',
        body: '## Test coverage rubric\nFor every new conditional, error path, or edge case in the diff, require a test that exercises it. Flag the specific untested branch — not "needs more tests" in general.',
        enabled: true,
      },
      boundTo: ['Test Quality Reviewer'],
    },
    {
      values: {
        workspaceId,
        name: 'mocking-smells',
        description: 'House convention: do not mock the unit under test or over-mock its dependencies.',
        type: 'convention',
        source: 'manual',
        body: '## Mocking smells\nNever mock the exact function/module a test is meant to verify. Prefer a real DB-backed `*.it.test.ts` over mocking persistence when the behavior under test IS the persistence.',
        enabled: true,
      },
      boundTo: ['Test Quality Reviewer'],
    },
    {
      values: {
        workspaceId,
        name: 'api-compat-rules',
        description: 'House convention: additive contract changes only, unless explicitly versioned.',
        type: 'convention',
        source: 'manual',
        body: '## API compatibility rules\nA route or shared DTO change must be additive (new optional field, new route) unless the PR explicitly calls out and versions a breaking change. Flag any removed/renamed field, changed status code, or newly-required field.',
        enabled: true,
      },
      boundTo: ['API Contract Reviewer'],
    },
  ];

  const nextOrderByAgent = new Map<string, number>();
  for (const s of seedSkills) {
    const [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, s.values.name)));
    let skillId: string;
    if (existing) {
      skillId = existing.id;
    } else {
      const [created] = await db.insert(t.skills).values(s.values).returning();
      skillId = created!.id;
      await db.insert(t.skillVersions).values({ skillId, version: 1, body: s.values.body });
    }
    for (const agentName of s.boundTo) {
      const agentId = agentIdByName.get(agentName);
      if (!agentId) continue;
      const order = nextOrderByAgent.get(agentId) ?? 0;
      nextOrderByAgent.set(agentId, order + 1);
      await db
        .insert(t.agentSkills)
        .values({ agentId, skillId, order })
        .onConflictDoNothing();
    }
  }

  // ---- L03 — a seeded conventions scan for acme/payments-api ----
  // The non-empty state (accepted/pending, config/model, every verification
  // kind) is otherwise unreachable without an API key — needed for the
  // conventions e2e flow, which never calls a real model.
  let [scan] = await db.select().from(t.conventionScans).where(eq(t.conventionScans.repoId, repoId));
  if (!scan) {
    [scan] = await db
      .insert(t.conventionScans)
      .values({
        workspaceId,
        repoId,
        status: 'done',
        sampleFileCount: 24,
        batchCount: 3,
        provider: 'openai',
        model: 'gpt-4.1-mini',
        tokensIn: 4820,
        tokensOut: 610,
        costUsd: 0.014,
        candidatesFound: 3,
        candidatesKept: 3,
        startedAt: new Date(),
        finishedAt: new Date(),
      })
      .returning();
  }
  const scanId = scan!.id;

  const seedConventions: Array<typeof t.conventions.$inferInsert> = [
    {
      workspaceId,
      repoId,
      scanId,
      ruleKey: 'chokepoint-redis-client',
      rule: "All Redis access goes through `src/lib/redis.ts` — no other module imports the redis client directly.",
      category: 'structure',
      status: 'accepted',
      accepted: true,
      source: 'model',
      evidencePath: 'src/lib/redis.ts',
      evidenceStartLine: 1,
      evidenceEndLine: 12,
      evidenceSnippet: "import Redis from 'ioredis';\n\nexport const redis = new Redis(process.env.REDIS_URL);",
      verification: 'pattern',
      supportCount: 8,
      violationCount: 0,
      confidence: 8 / 9,
    },
    {
      workspaceId,
      repoId,
      scanId,
      ruleKey: 'role-contract-handler-result',
      rule: 'Route handlers return `Result<T, ApiError>` and never throw for an expected failure.',
      category: 'api',
      status: 'pending',
      accepted: false,
      source: 'model',
      evidencePath: 'src/routes/charges.ts',
      evidenceStartLine: 14,
      evidenceEndLine: 20,
      evidenceSnippet:
        'export async function createCharge(req: ChargeRequest): Promise<Result<Charge, ApiError>> {\n  if (!req.amount) return err(invalidRequest());\n  ...\n}',
      verification: 'semantic',
      supportCount: 6,
      violationCount: 1,
      confidence: 6 / 8,
    },
    {
      workspaceId,
      repoId,
      scanId,
      ruleKey: 'tsconfig-strict-mode',
      rule: 'TypeScript strict mode is on — do not introduce implicit `any` or unchecked nulls.',
      category: 'typing',
      status: 'pending',
      accepted: false,
      source: 'config',
      evidencePath: 'tsconfig.json',
      evidenceStartLine: 3,
      evidenceEndLine: 3,
      evidenceSnippet: '"strict": true,',
      verification: 'config',
      supportCount: 0,
      violationCount: 0,
      confidence: 1,
    },
  ];
  for (const values of seedConventions) {
    await db.insert(t.conventions).values(values).onConflictDoNothing();
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
