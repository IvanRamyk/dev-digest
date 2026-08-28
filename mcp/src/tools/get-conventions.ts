/**
 * devdigest_get_conventions — GET /repos/:id/conventions?status=...
 *
 * Read-only. Returns a repo's learned conventions, defaulting to accepted ones.
 * NEVER POSTs a scan (that endpoint exists but is out of scope here) — a repo
 * that has never been scanned returns an error-forward "run a scan in the UI"
 * message rather than triggering work.
 *
 * SECURITY: convention rules and evidence snippets are derived from repo content
 * (third-party). They are wrapped in an untrusted marker so a downstream model
 * treats them as data.
 */
import type { ApiClient } from '../api/client.js';
import { okJson, toolError, wrapUntrusted, type ToolTextResult } from './_shared.js';
import { resolveRepoId } from '../api/resolve.js';
import { ApiUnreachableError } from '../api/errors.js';
import { toForwardMessage, unreachableMessage } from './errors-forward.js';

const VALID_STATUS = new Set(['pending', 'accepted', 'rejected', 'all']);

export function getConventionsHandler(client: ApiClient) {
  return async (args: { repo: string; status?: string }): Promise<ToolTextResult> => {
    try {
      const status = normalizeStatus(args.status);
      if ('error' in status) return toolError(status.error);

      const repoId = await resolveRepoId(client, args.repo);
      const view = await client.getConventions(repoId, status.value);

      // Never scanned: no scan row at all → teach the UI path, do not scan.
      if (!view.scan) {
        return toolError(
          `No convention scan has been run for ${args.repo}. Run a scan in the DevDigest UI first (Repo → Conventions → Scan), then retry. This tool is read-only and will not start one.`,
        );
      }

      const rules = view.candidates.map((c) => ({
        rule: c.rule,
        category: c.category,
        status: c.status,
        evidence_path: c.evidence_path,
        confidence: c.confidence,
      }));

      return okJson({
        repo: args.repo,
        scan_status: view.scan.status,
        status_filter: status.value,
        conventions: wrapUntrusted('repo_conventions', JSON.stringify(rules)),
      });
    } catch (err) {
      if (err instanceof ApiUnreachableError) return toolError(unreachableMessage(err));
      return toolError(toForwardMessage(err));
    }
  };
}

/** Default to "accepted"; validate a provided filter, teaching the valid set on error. */
function normalizeStatus(raw: string | undefined): { value: string } | { error: string } {
  if (raw === undefined || raw.trim() === '') return { value: 'accepted' };
  const lower = raw.trim().toLowerCase();
  if (VALID_STATUS.has(lower)) return { value: lower };
  return {
    error: `Unknown status "${raw}". Use one of: ${[...VALID_STATUS].join(', ')} (default "accepted").`,
  };
}
