/**
 * Resolvers — turn the flat, human-friendly tool args (`owner/name`, a PR number,
 * an agent name) into the opaque ids the API's routes expect.
 *
 * Each failure throws a typed error whose `.message` is already an error-forward
 * string: it names what went wrong AND the next action (which tool to call, the
 * expected format, or where to look). Tool handlers surface `.message` verbatim
 * as an `isError` result.
 *
 * A process-local `run_id → pull_id` map lets `get_findings({run_id})` avoid a
 * re-resolution. It is in-memory and lost on restart by design (plan R5); when
 * the id is absent, the caller falls back to requiring `repo`+`pr`.
 */
import type { Agent } from '@devdigest/shared';
import type { ApiClient } from './client.js';

/** `repo` argument was not `owner/name`. */
export class BadRepoFormatError extends Error {
  constructor(raw: string) {
    super(
      `Invalid repo "${raw}". Expected "owner/name" (e.g. "vercel/next.js") — two path segments, no URL, no trailing slash.`,
    );
    this.name = 'BadRepoFormatError';
  }
}

/** No PR with that number was found for the repo (after a sync). */
export class PrNotFoundError extends Error {
  constructor(repo: string, pr: number) {
    super(
      `PR #${pr} not found in ${repo}. The list only includes open and recently merged/closed PRs synced from GitHub — a PR closed or merged outside that window will not appear. Confirm the number, and that the repo has been added to DevDigest.`,
    );
    this.name = 'PrNotFoundError';
  }
}

/** No agent matched the given name. */
export class UnknownAgentError extends Error {
  constructor(name: string, available: string[]) {
    const list = available.length ? available.join(', ') : '(none configured)';
    super(
      `Unknown agent "${name}". Available agents: ${list}. Call devdigest_list_agents to see them.`,
    );
    this.name = 'UnknownAgentError';
  }
}

/** More than one agent shares the given name (no unique constraint server-side). */
export class AmbiguousAgentError extends Error {
  constructor(name: string, count: number) {
    super(
      `Agent name "${name}" is ambiguous — ${count} agents share it. Rename one in the DevDigest UI so the name is unique, then retry.`,
    );
    this.name = 'AmbiguousAgentError';
  }
}

const REPO_RE = /^[^/\s]+\/[^/\s]+$/;

/** Parse `owner/name`, throwing `BadRepoFormatError` on anything else. */
export function parseRepo(raw: string): { owner: string; name: string; fullName: string } {
  const trimmed = raw.trim();
  if (!REPO_RE.test(trimmed)) throw new BadRepoFormatError(raw);
  const [owner, name] = trimmed.split('/') as [string, string];
  return { owner, name, fullName: `${owner}/${name}` };
}

/**
 * Resolve `owner/name` → repo id, auto-adding the repo if it is not present yet.
 * Match is case-insensitive on `full_name`.
 */
export async function resolveRepoId(client: ApiClient, repoArg: string): Promise<string> {
  const { fullName } = parseRepo(repoArg);
  const repos = await client.getRepos();
  const existing = repos.find((r) => r.full_name.toLowerCase() === fullName.toLowerCase());
  if (existing) return existing.id;

  const added = await client.addRepo(`https://github.com/${fullName}`);
  return added.id;
}

/**
 * Resolve `(repoId, prNumber)` → pull id. `GET /repos/:id/pulls` triggers a
 * GitHub PR-sync server-side, so a just-opened PR appears here.
 */
export async function resolvePullId(
  client: ApiClient,
  repoId: string,
  repoArg: string,
  pr: number,
): Promise<string> {
  const pulls = await client.getPulls(repoId);
  const match = pulls.find((p) => p.number === pr);
  if (!match?.id) throw new PrNotFoundError(repoArg, pr);
  return match.id;
}

/**
 * Resolve an agent name → agent id. Exact-case match wins; otherwise a
 * case-insensitive match. Zero matches → `UnknownAgentError`; more than one
 * (case-insensitive) → `AmbiguousAgentError`.
 */
export async function resolveAgentId(client: ApiClient, name: string): Promise<string> {
  const agents = await client.getAgents();
  const exact = agents.find((a) => a.name === name);
  if (exact) return exact.id;

  const lower = name.trim().toLowerCase();
  const ci = agents.filter((a: Agent) => a.name.toLowerCase() === lower);
  if (ci.length === 0) {
    throw new UnknownAgentError(
      name,
      agents.map((a) => a.name),
    );
  }
  if (ci.length > 1) throw new AmbiguousAgentError(name, ci.length);
  return ci[0]!.id;
}

// ---- process-local run_id → pull_id map -----------------------------------

const runToPull = new Map<string, string>();

/** Remember which pull a run belongs to, for later `get_findings({run_id})`. */
export function rememberRun(runId: string, pullId: string): void {
  runToPull.set(runId, pullId);
}

/** Look up the pull for a run id, or `undefined` if unknown (e.g. after restart). */
export function lookupPull(runId: string): string | undefined {
  return runToPull.get(runId);
}

/** Test-only: clear the map between cases. */
export function _resetRunMap(): void {
  runToPull.clear();
}
