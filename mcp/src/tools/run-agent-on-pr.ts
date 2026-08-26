/**
 * devdigest_run_agent_on_pr — start a review, poll to completion, assemble result.
 *
 * The DevDigest review pipeline is async fire-and-forget (server/CLAUDE.md): there
 * is no synchronous run-and-return endpoint. So this tool composes:
 *   resolve repo → resolve pull (syncs from GitHub) → resolve agent →
 *   POST /pulls/:id/review → poll GET /pulls/:id/runs until terminal →
 *   assemble from GET /pulls/:id/reviews.
 *
 * A missing provider key surfaces ONLY as a failed run discovered by polling
 * (never a synchronous error), so we inspect the run's error text and, when it
 * names an unconfigured key, emit an actionable message naming the provider.
 *
 * Timeout is a SUCCESS, not an error: when the wait budget elapses while the run
 * is still going, we return `{status:"running", resume_with:"devdigest_get_findings"}`.
 *
 * SECURITY: findings are PR-derived → wrapped untrusted.
 */
import type { ApiClient } from '../api/client.js';
import type { McpConfig } from '../config.js';
import {
  normalizeFormat,
  normalizeSeverity,
  okJson,
  shapeFindings,
  toolError,
  wrapUntrusted,
  type ToolTextResult,
} from './_shared.js';
import {
  parseRepo,
  rememberRun,
  resolveAgentId,
  resolvePullId,
  resolveRepoId,
} from '../api/resolve.js';
import { ApiUnreachableError } from '../api/errors.js';
import {
  extractMissingKeyProvider,
  missingKeyMessage,
  toForwardMessage,
  unreachableMessage,
} from './errors-forward.js';

interface RunArgs {
  repo: string;
  pr: number;
  agent: string;
  response_format?: string;
  severity?: string;
  max_wait_ms?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function runAgentOnPrHandler(client: ApiClient, config: McpConfig) {
  return async (args: RunArgs): Promise<ToolTextResult> => {
    try {
      // (1) validate flat args up front → error-forward on bad format.
      parseRepo(args.repo); // throws BadRepoFormatError with a forward message
      if (!Number.isInteger(args.pr) || args.pr <= 0) {
        return toolError(`Invalid pr "${args.pr}". The PR number must be a positive integer.`);
      }
      const sev = normalizeSeverity(args.severity);
      if ('error' in sev) return toolError(sev.error);
      const format = normalizeFormat(args.response_format);

      // (2)–(4) resolve ids.
      const repoId = await resolveRepoId(client, args.repo);
      const pullId = await resolvePullId(client, repoId, args.repo, args.pr);
      const agentId = await resolveAgentId(client, args.agent);

      // (5) start the run.
      const started = await client.startReview(pullId, agentId);
      const target = started.runs[0];
      if (!target) {
        return toolError(
          `DevDigest accepted the request but started no run for agent "${args.agent}". The agent may be disabled — check devdigest_list_agents.`,
        );
      }
      const runId = target.run_id;
      rememberRun(runId, pullId);

      // (6) poll until terminal or the wait budget elapses.
      const deadline = Date.now() + (args.max_wait_ms ?? config.runMaxWaitMs);
      while (true) {
        const runs = await client.getRuns(pullId);
        const run = runs.find((r) => r.run_id === runId);

        if (run) {
          if (run.status === 'failed') {
            const provider = extractMissingKeyProvider(run.error);
            if (provider) return toolError(missingKeyMessage(provider));
            return toolError(
              `The review run failed: ${run.error ?? 'unknown error'}. Inspect it in the DevDigest UI, or re-run.`,
            );
          }
          if (run.status === 'cancelled') {
            return toolError('The review run was cancelled before it completed.');
          }
          if (run.status === 'done') break;
        }

        if (Date.now() >= deadline) {
          // Timeout is a SUCCESS: hand the caller a way to resume.
          return okJson({
            run_id: runId,
            status: 'running',
            repo: args.repo,
            pr: args.pr,
            resume_with: 'devdigest_get_findings',
            note: `The run is still going after the ${args.max_wait_ms ?? config.runMaxWaitMs}ms wait budget. Call devdigest_get_findings with this run_id (or repo + pr) shortly.`,
          });
        }
        await sleep(config.pollIntervalMs);
      }

      // (7) assemble from the persisted reviews for this run.
      const reviews = await client.getReviews(pullId);
      const forRun = reviews.filter((r) => r.run_id === runId);
      const findings = forRun.flatMap((r) => r.findings);
      const shaped = shapeFindings(findings, { format, severity: sev.value });
      const review = forRun.find((r) => r.kind === 'review') ?? forRun[0];

      return okJson({
        run_id: runId,
        status: 'done',
        repo: args.repo,
        pr: args.pr,
        ...(review ? { verdict: review.verdict, score: review.score } : {}),
        findings: wrapUntrusted('pr_findings', JSON.stringify(shaped.items, null, 2)),
        ...(shaped.truncated_note ? { truncated_note: shaped.truncated_note } : {}),
        ...(findings.length === 0 ? { note: 'Reviewed, clean — no findings.' } : {}),
      });
    } catch (err) {
      if (err instanceof ApiUnreachableError) return toolError(unreachableMessage(err));
      return toolError(toForwardMessage(err));
    }
  };
}
