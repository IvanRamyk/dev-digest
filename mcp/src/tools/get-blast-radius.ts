/**
 * devdigest_get_blast_radius — a PR's impact map from the code index.
 *
 * Resolves `repo` + `pr` → pull id via the shared resolvers, then reads
 * `GET /pulls/:id/blast`. Returns a concise, severity-of-nothing rendering:
 * changed symbols → top callers `file:line` → affected endpoints/crons →
 * `index_state`. When the index is not `full`, a one-line "index incomplete"
 * note is prepended so a thin index is never mistaken for "no impact".
 *
 * SECURITY: symbol/file/endpoint names are PR/repo-derived (third-party) →
 * wrapped untrusted so a downstream model treats them as data, not instructions.
 */
import type { BlastRadius } from '@devdigest/shared';
import type { ApiClient } from '../api/client.js';
import { okJson, toolError, wrapUntrusted, type ToolTextResult } from './_shared.js';
import { resolvePullId, resolveRepoId } from '../api/resolve.js';
import { ApiUnreachableError } from '../api/errors.js';
import { toForwardMessage, unreachableMessage } from './errors-forward.js';

/** Top callers surfaced per symbol in the rendering (server already caps at 20). */
const CALLERS_SHOWN = 8;

interface GetBlastRadiusArgs {
  repo: string;
  pr: number;
}

export function blastRadiusHandler(client: ApiClient) {
  return async (args: GetBlastRadiusArgs): Promise<ToolTextResult> => {
    try {
      const repoId = await resolveRepoId(client, args.repo);
      const pullId = await resolvePullId(client, repoId, args.repo, args.pr);
      const blast = await client.getBlastRadius(pullId);

      const shaped = shape(blast);
      const incomplete = blast.index_state.status !== 'full';

      return okJson({
        ...(incomplete
          ? {
              index_note: `The code index for ${args.repo} is ${blast.index_state.status}${
                blast.index_state.reason ? ` (${blast.index_state.reason})` : ''
              } — the impact below may be partial, not "no impact".`,
            }
          : {}),
        index_state: blast.index_state,
        summary: blast.summary,
        impact: wrapUntrusted('pr_blast_radius', JSON.stringify(shaped, null, 2)),
        ...(blast.changed_symbols.length === 0
          ? { note: 'No changed symbols were found in this PR\'s files.' }
          : {}),
      });
    } catch (err) {
      if (err instanceof ApiUnreachableError) return toolError(unreachableMessage(err));
      return toolError(toForwardMessage(err));
    }
  };
}

/** Concise projection of a BlastRadius: names/counts only, callers capped. */
function shape(blast: BlastRadius) {
  return {
    changed_symbols: blast.changed_symbols.map((s) => `${s.name} (${s.kind}) @ ${s.file}`),
    downstream: blast.downstream.map((d) => ({
      symbol: d.symbol,
      caller_count: d.callers.length,
      top_callers: d.callers.slice(0, CALLERS_SHOWN).map((c) => `${c.name} @ ${c.file}:${c.line}`),
      endpoints_affected: d.endpoints_affected,
      crons_affected: d.crons_affected,
    })),
  };
}
