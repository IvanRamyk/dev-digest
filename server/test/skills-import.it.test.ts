import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills-import] Docker not available — skipping integration tests.');
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/** A .zip with SKILL.md + a shell script + a binary — the manual walkthrough fixture. */
function buildSampleZip(): Uint8Array {
  return zipSync({
    'SKILL.md': strToU8('# Sample Skill\nA rule for the reviewer.'),
    'install.sh': strToU8('#!/bin/sh\necho hi'),
    'logo.bin': new Uint8Array([0, 1, 2, 3, 4]),
  });
}

/**
 * A1 §3 — import: markdown and archive. Preview persists nothing; confirm lands
 * disabled with an untrusted-wrapped body.
 */
d('skills import (Testcontainers pg)', () => {
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

  it('imports a .md file: preview persists nothing, confirm lands disabled with an untrusted-wrapped body', async () => {
    const app = await makeApp();
    const md = '# pr-quality-rubric\nCheck test coverage before approving.';

    const preview = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'pr-quality-rubric.md', content_base64: b64(strToU8(md)) },
    });
    expect(preview.statusCode).toBe(200);
    const previewBody = preview.json();
    expect(previewBody.name).toBe('pr-quality-rubric');
    expect(previewBody.body).toBe(md);
    expect(previewBody.skipped).toEqual([]);

    const beforeList = (await app.inject({ method: 'GET', url: '/skills' })).json();
    // preview must not have written anything
    expect(beforeList.some((s: { name: string }) => s.name === 'pr-quality-rubric')).toBe(false);

    const confirmed = await app.inject({
      method: 'POST',
      url: '/skills/import',
      payload: previewBody,
    });
    expect(confirmed.statusCode).toBe(201);
    const skill = confirmed.json();
    expect(skill.enabled).toBe(false);
    expect(skill.body).toContain('<untrusted source="imported:extracted">');
    expect(skill.body).toContain('Check test coverage before approving.');

    await app.close();
  });

  it('a .zip whose non-markdown entries all come back not_processed', async () => {
    const app = await makeApp();
    const zip = buildSampleZip();

    const preview = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'sample-skill.zip', content_base64: b64(zip) },
    });
    expect(preview.statusCode).toBe(200);
    const body = preview.json();
    expect(body.body).toBe('# Sample Skill\nA rule for the reviewer.');
    expect(body.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'install.sh', reason: 'not_processed' }),
        expect.objectContaining({ path: 'logo.bin', reason: 'not_processed' }),
      ]),
    );
    expect(body.skipped).toHaveLength(2);

    const confirmed = await app.inject({ method: 'POST', url: '/skills/import', payload: body });
    expect(confirmed.statusCode).toBe(201);
    expect(confirmed.json().enabled).toBe(false);

    await app.close();
  });

  it('a .zip with a `..`-path entry rejects that entry as unsafe_path (zip-slip guard)', async () => {
    const app = await makeApp();
    const zip = zipSync({
      'SKILL.md': strToU8('# ok\nbody'),
      '../../etc/passwd': strToU8('evil'),
    });

    const preview = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'evil.zip', content_base64: b64(zip) },
    });
    expect(preview.statusCode).toBe(200);
    const body = preview.json();
    expect(body.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '../../etc/passwd', reason: 'unsafe_path' }),
      ]),
    );

    await app.close();
  });

  it('an oversize archive is rejected (decompression-bomb guard)', async () => {
    const app = await makeApp();
    const zip = zipSync({ 'SKILL.md': strToU8('x'.repeat(2_200_000)) });

    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'huge.zip', content_base64: b64(zip) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('archive_too_large');

    await app.close();
  });
});
