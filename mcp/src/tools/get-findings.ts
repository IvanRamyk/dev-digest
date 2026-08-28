/**
 * devdigest_get_findings — read findings from a completed review.
 *
 * Two entry paths (require one):
 *   - run_id: from a prior devdigest_run_agent_on_pr call THIS session (the
 *     process-local run→pull map). Lost on restart (plan R5) → fall back to repo+pr.
 *   - repo + pr: resolve the pull, then read its reviews.
 *
 * A still-running or failed run returns status guidance, not (empty) findings —
 * so "no findings yet" is never mistaken for "reviewed, clean".
 *
 * SECURITY: finding text is PR-derived (third-party) → wrapped untrusted.
 */
import type { ApiClient, ReviewRecordDto } from '../api/client.js';
import {
  normalizeFormat,
  normalizeSeverity,
  okJson,
  shapeFindings,
  toolError,
  wrapUntrusted,
  type ToolTextResult,
} from './_shared.js';
import type { McpConfig } from '../config.js';
import { lookupPull, resolvePullId, resolveRepoId } from '../api/resolve.js';
import { ApiUnreachableError } from '../api/errors.js';
import { toForwardMessage, unreachableMessage } from './errors-forward.js';

interface GetFindingsArgs {
  run_id?: string;
  repo?: string;
  pr?: number;
  response_format?: string;
  severity?: string;
  all_runs?: boolean;
}

/** One review in the grouped response: server/model-authored fields, plus the
 *  review's findings wrapped as untrusted (third-party) text. */
interface ReviewGroup {
  run_id: string | null;
  verdict: string | null;
  score: number | null;
  findings: string;
  truncated_note?: string;
}

export function getFindingsHandler(client: ApiClient, _config: McpConfig) {
  return async (args: GetFindingsArgs): Promise<ToolTextResult> => {
    try {
      const sev = normalizeSeverity(args.severity);
      if ('error' in sev) return toolError(sev.error);
      const format = normalizeFormat(args.response_format);

      // Resolve the pull. run_id wins when its pull is known this session.
      const pullId = await resolvePull(client, args);
      if ('error' in pullId) return toolError(pullId.error);

      // If a specific run was named, cross-check its terminal status first.
      if (args.run_id) {
        const runs = await client.getRuns(pullId.value);
        const run = runs.find((r) => r.run_id === args.run_id);
        if (run && run.status !== 'done') {
          return okJson(runStatusGuidance(args.run_id, run.status, run.error));
        }
      }

      const reviews = await client.getReviews(pullId.value);
      const included = selectReviews(reviews, args);

      let totalFindings = 0;
      const grouped: ReviewGroup[] = included.map((r) => {
        const shaped = shapeFindings(r.findings, { format, severity: sev.value });
        totalFindings += shaped.total;
        return {
          run_id: r.run_id,
          verdict: r.verdict,
          score: r.score,
          findings: wrapUntrusted('pr_findings', JSON.stringify(shaped.items)),
          ...(shaped.truncated_note ? { truncated_note: shaped.truncated_note } : {}),
        };
      });

      return okJson({
        reviews: grouped,
        total_findings: totalFindings,
        ...(totalFindings === 0 ? { note: 'No findings — reviewed and clean.' } : {}),
      });
    } catch (err) {
      if (err instanceof ApiUnreachableError) return toolError(unreachableMessage(err));
      return toolError(toForwardMessage(err));
    }
  };
}

/** Resolve to a pull id from run_id (session map) or repo+pr, or an error-forward string. */
async function resolvePull(
  client: ApiClient,
  args: GetFindingsArgs,
): Promise<{ value: string } | { error: string }> {
  if (args.run_id) {
    const known = lookupPull(args.run_id);
    if (known) return { value: known };
    if (!(args.repo && args.pr)) {
      return {
        error: `run_id "${args.run_id}" is not known to this session (the run→PR map is in-memory and resets on restart). Re-run devdigest_run_agent_on_pr, or call this tool with repo + pr instead.`,
      };
    }
  }
  if (!(args.repo && args.pr)) {
    return { error: 'Provide either run_id (from this session) or both repo and pr.' };
  }
  const repoId = await resolveRepoId(client, args.repo);
  const pullId = await resolvePullId(client, repoId, args.repo, args.pr);
  return { value: pullId };
}

/**
 * Choose which review records to return:
 *  - run_id given  → only that run's review(s);
 *  - all_runs true → every review, newest first;
 *  - default       → just the latest review.
 * Prefers `review`-kind records (they carry findings) when any exist.
 */
function selectReviews(reviews: ReviewRecordDto[], args: GetFindingsArgs): ReviewRecordDto[] {
  const reviewKind = reviews.filter((r) => r.kind === 'review');
  const pool = reviewKind.length ? reviewKind : reviews;

  if (args.run_id) return pool.filter((r) => r.run_id === args.run_id);
  if (args.all_runs) return [...pool].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const latest = pickLatest(pool);
  return latest ? [latest] : [];
}

/** Guidance for a run that is not `done` yet. */
function runStatusGuidance(runId: string, status: string | null, error: string | null) {
  if (status === 'failed') {
    return {
      run_id: runId,
      status,
      error: error ?? 'unknown',
      note: 'This run failed — no findings were produced. Inspect the error above or re-run.',
    };
  }
  return {
    run_id: runId,
    status: status ?? 'unknown',
    note: 'This run has not finished. Wait and call devdigest_get_findings again, or re-run with a longer max_wait_ms.',
  };
}

/** The newest 'review'-kind record (they arrive newest-first is not guaranteed → pick by created_at). */
function pickLatest(reviews: ReviewRecordDto[]): ReviewRecordDto | undefined {
  const kind = reviews.filter((r) => r.kind === 'review');
  const pool = kind.length ? kind : reviews;
  return pool.reduce<ReviewRecordDto | undefined>((best, r) => {
    if (!best) return r;
    return r.created_at > best.created_at ? r : best;
  }, undefined);
}
