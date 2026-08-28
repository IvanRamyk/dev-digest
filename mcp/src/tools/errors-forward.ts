/**
 * Error-forward message builders shared by every tool handler.
 *
 * "Error-forward" = the message names what failed AND the next action, so the
 * calling model can recover without a human. These live in one place so the
 * wording stays consistent and the top-level catch in each handler is trivial.
 */
import type { ApiUnreachableError } from '../api/errors.js';
import { ApiError } from '../api/errors.js';

/** The API host is down — tell the user how to start it. */
export function unreachableMessage(err: ApiUnreachableError): string {
  return `The DevDigest API is unreachable at ${err.baseUrl}. Start the stack with ./scripts/dev.sh (and ensure the DB is migrated and seeded), then retry.`;
}

/** Missing provider API key, detected from a failed run's error text. */
export function missingKeyMessage(provider: string): string {
  const envName = `${provider.toUpperCase()}_API_KEY`;
  return `The run failed because ${envName} is not configured. Add the ${provider} API key in the DevDigest UI under Settings → API Keys (stored via SecretsProvider, never in the DB or env), then retry.`;
}

/**
 * Convert a caught API error into an actionable message. 429 (rate limit) gets
 * a "slow down" hint; everything else surfaces the server's own message.
 */
export function apiErrorMessage(err: ApiError): string {
  if (err.status === 429) {
    return `DevDigest is rate-limiting review requests (max 10/min, 3 concurrent). Wait a moment and try again — do not retry in a tight loop.`;
  }
  return err.message;
}

/** True when a failed run's error text names an unconfigured provider key. */
export function extractMissingKeyProvider(errorText: string | null | undefined): string | null {
  if (!errorText) return null;
  const m = /([A-Z]+)_API_KEY is not configured/.exec(errorText);
  return m ? m[1]!.toLowerCase() : null;
}

/**
 * Render a caught error (that is NOT an `ApiUnreachableError`) to a forward
 * message. `ApiError` gets its status-aware treatment; a typed resolver error's
 * `.message` is already forward-shaped, so it passes through.
 */
export function toForwardMessage(err: unknown): string {
  if (err instanceof ApiError) return apiErrorMessage(err);
  return (err as Error)?.message ?? 'Unexpected error.';
}
