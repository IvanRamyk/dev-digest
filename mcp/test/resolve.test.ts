import { describe, it, expect, beforeEach } from 'vitest';
import {
  _resetRunMap,
  lookupPull,
  parseRepo,
  rememberRun,
  resolveAgentId,
  resolvePullId,
  resolveRepoId,
  BadRepoFormatError,
  PrNotFoundError,
  UnknownAgentError,
  AmbiguousAgentError,
} from '../src/api/resolve.js';
import { fakeClient, makeAgent, makePr, makeRepo } from './fixtures.js';

describe('parseRepo', () => {
  it('accepts owner/name and rejects everything else with a format hint', () => {
    expect(parseRepo('acme/widget')).toEqual({
      owner: 'acme',
      name: 'widget',
      fullName: 'acme/widget',
    });
    for (const bad of ['acme', 'acme/widget/x', 'https://github.com/acme/widget', 'acme/']) {
      expect(() => parseRepo(bad)).toThrow(BadRepoFormatError);
    }
    // the error is error-forward: it names the expected shape
    try {
      parseRepo('nope');
    } catch (e) {
      expect((e as Error).message).toContain('owner/name');
    }
  });
});

describe('resolveRepoId', () => {
  it('matches an existing repo case-insensitively without adding', async () => {
    const client = fakeClient();
    client.getRepos.mockResolvedValue([makeRepo({ full_name: 'Acme/Widget', id: 'repo-9' })]);
    const id = await resolveRepoId(client, 'acme/widget');
    expect(id).toBe('repo-9');
    expect(client.addRepo).not.toHaveBeenCalled();
  });

  it('auto-adds a repo that is not present yet, using the returned id', async () => {
    const client = fakeClient();
    client.getRepos.mockResolvedValue([]);
    client.addRepo.mockResolvedValue(makeRepo({ id: 'repo-new' }));
    const id = await resolveRepoId(client, 'acme/widget');
    expect(client.addRepo).toHaveBeenCalledWith('https://github.com/acme/widget');
    expect(id).toBe('repo-new');
  });
});

describe('resolvePullId', () => {
  it('finds a PR by number', async () => {
    const client = fakeClient();
    client.getPulls.mockResolvedValue([makePr({ number: 7, id: 'pull-7' })]);
    expect(await resolvePullId(client, 'repo-1', 'acme/widget', 7)).toBe('pull-7');
  });

  it('throws PrNotFoundError with sync-window guidance when absent', async () => {
    const client = fakeClient();
    client.getPulls.mockResolvedValue([makePr({ number: 9 })]);
    await expect(resolvePullId(client, 'repo-1', 'acme/widget', 7)).rejects.toThrow(
      PrNotFoundError,
    );
    try {
      await resolvePullId(client, 'repo-1', 'acme/widget', 7);
    } catch (e) {
      expect((e as Error).message).toMatch(/merged.*window|closed/i);
    }
  });
});

describe('resolveAgentId', () => {
  it('prefers an exact-case match', async () => {
    const client = fakeClient();
    client.getAgents.mockResolvedValue([
      makeAgent({ id: 'a1', name: 'reviewer' }),
      makeAgent({ id: 'a2', name: 'Reviewer' }),
    ]);
    expect(await resolveAgentId(client, 'Reviewer')).toBe('a2');
  });

  it('falls back to a case-insensitive match', async () => {
    const client = fakeClient();
    client.getAgents.mockResolvedValue([makeAgent({ id: 'a1', name: 'Reviewer' })]);
    expect(await resolveAgentId(client, 'reviewer')).toBe('a1');
  });

  it('lists available names on an unknown agent', async () => {
    const client = fakeClient();
    client.getAgents.mockResolvedValue([makeAgent({ name: 'Security' })]);
    await expect(resolveAgentId(client, 'Perf')).rejects.toThrow(UnknownAgentError);
    try {
      await resolveAgentId(client, 'Perf');
    } catch (e) {
      expect((e as Error).message).toContain('Security');
      expect((e as Error).message).toContain('devdigest_list_agents');
    }
  });

  it('errors on ambiguity instead of auto-picking', async () => {
    const client = fakeClient();
    client.getAgents.mockResolvedValue([
      makeAgent({ id: 'a1', name: 'reviewer' }),
      makeAgent({ id: 'a2', name: 'REVIEWER' }),
    ]);
    await expect(resolveAgentId(client, 'Reviewer')).rejects.toThrow(AmbiguousAgentError);
  });
});

describe('run→pull map', () => {
  beforeEach(() => _resetRunMap());

  it('remembers and looks up a pull by run id, empty until set', () => {
    expect(lookupPull('run-x')).toBeUndefined();
    rememberRun('run-x', 'pull-x');
    expect(lookupPull('run-x')).toBe('pull-x');
  });
});
