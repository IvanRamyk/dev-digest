import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * A1 — skills CRUD + versioning round-trip.
 */
d('skills CRUD + versioning (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'Test Coverage Rubric',
    body: '# Rubric\nFlag missing branch coverage.',
  };

  it('create → list → get round-trip; a body edit bumps version and adds a skill_versions row', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill.version).toBe(1);
    expect(skill.enabled).toBe(true);

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.some((s: { id: string }) => s.id === skill.id)).toBe(true);

    const got = await app.inject({ method: 'GET', url: `/skills/${skill.id}` });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toMatchObject({ name: createBody.name });

    // body edit bumps version
    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: '# Rubric\nFlag missing branch coverage AND edge cases.' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0].body).toContain('edge cases');
    expect(versions[1].body).toBe(createBody.body);

    await app.close();
  });

  it('a name-only edit does NOT bump the version or add a skill_versions row', async () => {
    const app = await makeApp();
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json();

    const updated = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { name: 'Renamed Rubric' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(1);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions).toHaveLength(1);

    await app.close();
  });

  it('restore forward-bumps to a new version rather than rewinding the counter', async () => {
    const app = await makeApp();
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json();
    await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: 'v2 body' },
    });
    await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: 'v3 body' },
    });

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${skill.id}/versions/1/restore`,
    });
    expect(restored.statusCode).toBe(200);
    const restoredDto = restored.json();
    expect(restoredDto.version).toBe(4); // forward-bumped, not rewound to 1
    expect(restoredDto.body).toBe(createBody.body);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([4, 3, 2, 1]);

    await app.close();
  });

  it('cross-workspace fetch 404s', async () => {
    const app = await makeApp();
    const { db } = pg.handle;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-skills' }).returning();
    const [foreign] = await db
      .insert(t.skills)
      .values({
        workspaceId: otherWs!.id,
        name: 'Foreign Skill',
        description: 'x',
        type: 'custom',
        source: 'manual',
        body: 'x',
      })
      .returning();

    const res = await app.inject({ method: 'GET', url: `/skills/${foreign!.id}` });
    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('delete cascades the agent_skills links', async () => {
    const app = await makeApp();
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Linked Agent', provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'x' },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skill.id] },
    });

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });
    expect(del.statusCode).toBe(200);

    const links = (
      await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })
    ).json();
    expect(links).toHaveLength(0);

    await app.close();
  });
});
