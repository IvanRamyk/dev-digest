/**
 * Thin HTTP client over the DevDigest API — the ONLY I/O in this package.
 *
 * Uses native `fetch`. Every method targets the configured base URL only
 * (SECURITY: no user-controlled host). On a non-2xx it throws `ApiError`; on a
 * connection failure it throws `ApiUnreachableError`. Response bodies are typed
 * from `@devdigest/shared` where the server returns a shared contract, and with
 * a local interface where the endpoint's DTO is server-internal.
 *
 * Auth: the local DevDigest server is no-auth (adapters/auth/local.ts). We send
 * no header by default; an optional bearer from config is wired for forward-
 * compat and is NEVER logged.
 */
import type {
  Agent,
  BlastRadius,
  ConventionCandidate,
  ConventionScan,
  PrMeta,
  Repo,
  ReviewRunResponse,
  RunSummary,
} from '@devdigest/shared';
import type { McpConfig } from '../config.js';
import { ApiUnreachableError, apiErrorFromResponse } from './errors.js';

/** `GET /pulls/:id/reviews` → the persisted reviews for a PR (ReviewRecord shape). */
export interface ReviewRecordDto {
  id: string;
  pr_id: string;
  agent_id: string | null;
  run_id: string | null;
  agent_name?: string | null;
  kind: 'summary' | 'review';
  verdict: string | null;
  summary: string | null;
  score: number | null;
  model: string | null;
  grounding?: string | null;
  created_at: string;
  findings: ReviewFindingDto[];
}

/** One finding inside a persisted review (FindingRecord shape). */
export interface ReviewFindingDto {
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion?: string | null;
  confidence: number;
  kind?: string | null;
  review_id: string;
  accepted_at: string | null;
  dismissed_at: string | null;
}

/** `GET /repos/:id/conventions` → `{ scan, candidates }` (conventions/service.ts getView). */
export interface ConventionsView {
  scan: ConventionScan | null;
  candidates: ConventionCandidate[];
}

export class ApiClient {
  constructor(private readonly config: McpConfig) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { Accept: 'application/json' };
    if (this.config.apiToken) h.Authorization = `Bearer ${this.config.apiToken}`;
    return h;
  }

  /** Core request helper. Throws ApiError / ApiUnreachableError; returns parsed JSON. */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.config.apiUrl}${path}`;
    const headers = this.headers();
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (cause) {
      throw new ApiUnreachableError(this.config.apiUrl, cause);
    }

    if (!res.ok) throw await apiErrorFromResponse(res);

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  // ---- Agents -------------------------------------------------------------
  getAgents(): Promise<Agent[]> {
    return this.request<Agent[]>('GET', '/agents');
  }

  // ---- Repos --------------------------------------------------------------
  getRepos(): Promise<Repo[]> {
    return this.request<Repo[]>('GET', '/repos');
  }

  addRepo(url: string): Promise<Repo> {
    return this.request<Repo>('POST', '/repos', { url });
  }

  // ---- Pulls --------------------------------------------------------------
  /** Lists PRs for a repo — this call triggers a GitHub PR-sync server-side. */
  getPulls(repoId: string): Promise<PrMeta[]> {
    return this.request<PrMeta[]>('GET', `/repos/${encodeURIComponent(repoId)}/pulls`);
  }

  // ---- Reviews ------------------------------------------------------------
  /** Fire a review run for one agent. Fire-and-forget server-side; poll runs for status. */
  startReview(pullId: string, agentId: string): Promise<ReviewRunResponse> {
    return this.request<ReviewRunResponse>(
      'POST',
      `/pulls/${encodeURIComponent(pullId)}/review`,
      { agentId },
    );
  }

  /** All runs for a PR (any status), newest first. */
  getRuns(pullId: string): Promise<RunSummary[]> {
    return this.request<RunSummary[]>('GET', `/pulls/${encodeURIComponent(pullId)}/runs`);
  }

  /** Persisted reviews (with findings) for a PR. */
  getReviews(pullId: string): Promise<ReviewRecordDto[]> {
    return this.request<ReviewRecordDto[]>(
      'GET',
      `/pulls/${encodeURIComponent(pullId)}/reviews`,
    );
  }

  // ---- Blast radius -------------------------------------------------------
  /** The PR's impact map (changed symbols → callers → endpoints/crons). Read-only. */
  getBlastRadius(pullId: string): Promise<BlastRadius> {
    return this.request<BlastRadius>('GET', `/pulls/${encodeURIComponent(pullId)}/blast`);
  }

  // ---- Conventions --------------------------------------------------------
  /** Read conventions for a repo (read-only — never triggers a scan). */
  getConventions(repoId: string, status: string): Promise<ConventionsView> {
    return this.request<ConventionsView>(
      'GET',
      `/repos/${encodeURIComponent(repoId)}/conventions?status=${encodeURIComponent(status)}`,
    );
  }
}
