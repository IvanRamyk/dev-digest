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
import type { ApiClient, ReviewFindingDto, ReviewRecordDto } from '../api/client.js';
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
      const relevant = args.run_id
        ? reviews.filter((r) => r.run_id === args.run_id)
        : reviews;

      const findings: ReviewFindingDto[] = relevant.flatMap((r) => r.findings);
      const shaped = shapeFindings(findings, { format, severity: sev.value });
      const latest = pickLatest(relevant);

      return okJson({
        ...(args.run_id ? { run_id: args.run_id } : {}),
        ...(latest ? { verdict: latest.verdict, score: latest.score } : {}),
        findings: wrapUntrusted('pr_findings', JSON.stringify(shaped.items, null, 2)),
        ...(shaped.truncated_note ? { truncated_note: shaped.truncated_note } : {}),
        ...(findings.length === 0 ? { note: 'No findings — reviewed and clean.' } : {}),
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
