/**
 * Runtime configuration, read once from the environment at startup.
 *
 * Everything here is server-controlled (env vars set by whoever launches the
 * MCP server), never attacker-controlled tool input. Secrets are NOT accepted
 * here beyond an optional forward-compat bearer token — the DevDigest API is a
 * local no-auth service (`server/src/adapters/auth/local.ts`), so the token is
 * unset by default and never logged.
 */

export interface McpConfig {
  /** Base URL of the DevDigest HTTP API. No `/api` prefix — routes sit at root. */
  apiUrl: string;
  /** Optional bearer token, forwarded as `Authorization: Bearer <token>` when set. */
  apiToken: string | undefined;
  /** Total wall-clock budget for a blocking `run_agent_on_pr` before it returns "still running". */
  runMaxWaitMs: number;
  /** Delay between `GET /pulls/:id/runs` polls while a run is in flight. */
  pollIntervalMs: number;
  /** When true, register the (stub) `devdigest_get_blast_radius` tool. Off by default. */
  enableBlastRadius: boolean;
}

const DEFAULTS = {
  apiUrl: 'http://localhost:3001',
  runMaxWaitMs: 90_000,
  pollIntervalMs: 3_000,
} as const;

/** Parse a positive-integer env var, falling back to `fallback` when unset or invalid. */
function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Parse a boolean-ish env var. `1`, `true`, `yes`, `on` (case-insensitive) → true. */
function boolEnv(name: string): boolean {
  const raw = process.env[name];
  if (raw === undefined) return false;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const apiUrl = (env.DEVDIGEST_API_URL?.trim() || DEFAULTS.apiUrl).replace(/\/+$/, '');
  const token = env.DEVDIGEST_API_TOKEN?.trim();
  return {
    apiUrl,
    apiToken: token && token.length > 0 ? token : undefined,
    runMaxWaitMs: intEnv('MCP_RUN_MAX_WAIT_MS', DEFAULTS.runMaxWaitMs),
    pollIntervalMs: intEnv('MCP_POLL_INTERVAL_MS', DEFAULTS.pollIntervalMs),
    enableBlastRadius: boolEnv('MCP_ENABLE_BLAST_RADIUS'),
  };
}
