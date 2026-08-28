/**
 * Runtime configuration, read once from the environment at startup and validated
 * with Zod. An invalid value (e.g. a non-numeric timeout or a malformed API URL)
 * makes `loadConfig` THROW so the server fails fast at boot rather than running
 * with a silently-defaulted misconfiguration.
 *
 * Everything here is server-controlled (env vars set by whoever launches the
 * MCP server), never attacker-controlled tool input. Secrets are NOT accepted
 * here beyond an optional forward-compat bearer token — the DevDigest API is a
 * local no-auth service (`server/src/adapters/auth/local.ts`), so the token is
 * unset by default and never logged.
 */
import { z } from 'zod';

export interface McpConfig {
  /** Base URL of the DevDigest HTTP API. No `/api` prefix — routes sit at root. */
  apiUrl: string;
  /** Optional bearer token, forwarded as `Authorization: Bearer <token>` when set. */
  apiToken: string | undefined;
  /** Total wall-clock budget for a blocking `run_agent_on_pr` before it returns "still running". */
  runMaxWaitMs: number;
  /** Delay between `GET /pulls/:id/runs` polls while a run is in flight. */
  pollIntervalMs: number;
  /** When true, force-register the `devdigest_get_blast_radius` tool (now default-on regardless). */
  enableBlastRadius: boolean;
}

const DEFAULTS = {
  apiUrl: 'http://localhost:3001',
  runMaxWaitMs: 90_000,
  pollIntervalMs: 3_000,
} as const;

/** Treat an empty/whitespace-only env var as "unset" so the schema default applies. */
const emptyToUndefined = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

/** A positive-integer millisecond env var. Invalid (non-numeric, ≤0) → parse error → throw. */
const positiveIntMs = (fallback: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(fallback));

/** Boolean-ish env var: `1`, `true`, `yes`, `on` (case-insensitive) → true; anything else → false. */
const booleanish = z.preprocess(
  (v) => (typeof v === 'string' ? /^(1|true|yes|on)$/i.test(v.trim()) : v),
  z.boolean().default(false),
);

/** The env contract. Unknown keys are ignored; declared keys are validated/coerced. */
const EnvSchema = z.object({
  DEVDIGEST_API_URL: z.preprocess(
    emptyToUndefined,
    z.string().url('DEVDIGEST_API_URL must be a valid URL').default(DEFAULTS.apiUrl),
  ),
  DEVDIGEST_API_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  MCP_RUN_MAX_WAIT_MS: positiveIntMs(DEFAULTS.runMaxWaitMs),
  MCP_POLL_INTERVAL_MS: positiveIntMs(DEFAULTS.pollIntervalMs),
  MCP_ENABLE_BLAST_RADIUS: booleanish,
});

/**
 * Parse + validate the environment into an `McpConfig`. THROWS a readable error
 * listing every offending variable when validation fails — the server is meant
 * to crash at startup on a bad config, not limp along on defaults.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid MCP server configuration:\n${issues}`);
  }
  const v = parsed.data;
  return {
    apiUrl: v.DEVDIGEST_API_URL.replace(/\/+$/, ''),
    apiToken: v.DEVDIGEST_API_TOKEN,
    runMaxWaitMs: v.MCP_RUN_MAX_WAIT_MS,
    pollIntervalMs: v.MCP_POLL_INTERVAL_MS,
    enableBlastRadius: v.MCP_ENABLE_BLAST_RADIUS,
  };
}
