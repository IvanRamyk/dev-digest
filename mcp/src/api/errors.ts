/**
 * Typed error layer for the HTTP API client.
 *
 * The DevDigest API returns a stable envelope on every non-2xx:
 *   { error: { code, message, details? } }   (server/src/platform/errors.ts,
 *   rendered by server/src/app.ts setErrorHandler). We parse that conservatively
 *   and fall back to raw text when the body is not JSON in that shape.
 *
 * Network-level failures (API not running) are surfaced as `ApiUnreachableError`
 * carrying the base URL so tools can render the "start ./scripts/dev.sh" hint.
 *
 * SECURITY: never include request bodies (which could carry secrets) in an error
 * message. We never accept secrets as arguments, so bodies should not carry them
 * either — but we still keep error text to the server's own message + status.
 */

/** An HTTP error returned by the API, mapped from the `{ error: {...} }` envelope. */
export class ApiError extends Error {
  constructor(
    /** HTTP status code. */
    public readonly status: number,
    /** Server-provided message (or a raw-text fallback). */
    message: string,
    /** Server-provided stable code (e.g. `not_found`, `config_error`), when present. */
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The API host could not be reached at all (connection refused, DNS, etc.). */
export class ApiUnreachableError extends Error {
  constructor(
    public readonly baseUrl: string,
    cause?: unknown,
  ) {
    super(`DevDigest API is unreachable at ${baseUrl}`);
    this.name = 'ApiUnreachableError';
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/** Narrow an unknown value to the API error envelope's `error` object. */
function extractEnvelope(body: unknown): { code?: string; message?: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const err = (body as Record<string, unknown>).error;
  if (typeof err !== 'object' || err === null) return null;
  const e = err as Record<string, unknown>;
  const code = typeof e.code === 'string' ? e.code : undefined;
  const message = typeof e.message === 'string' ? e.message : undefined;
  return { code, message };
}

/**
 * Build an `ApiError` from a non-2xx `Response`. Tries the JSON envelope first,
 * then a raw-text body, then a generic status message — never throws.
 */
export async function apiErrorFromResponse(res: Response): Promise<ApiError> {
  let rawText = '';
  try {
    rawText = await res.text();
  } catch {
    // body already consumed or unreadable — fall through to status-only message
  }
  if (rawText) {
    try {
      const parsed = extractEnvelope(JSON.parse(rawText));
      if (parsed?.message) return new ApiError(res.status, parsed.message, parsed.code);
    } catch {
      // not JSON in the envelope shape — use the raw text below
    }
    return new ApiError(res.status, rawText.slice(0, 500));
  }
  return new ApiError(res.status, `HTTP ${res.status} ${res.statusText}`.trim());
}
