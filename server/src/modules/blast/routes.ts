import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { BlastRadius } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * Blast Radius module. Transport only: parse the request, delegate to
 * BlastService.
 *   GET /pulls/:id/blast → the PR's impact map (changed symbols → callers →
 *                          affected endpoints/crons), with an `index_state`
 *                          signal so a thin/absent index is never masked.
 *
 * No `response` schema (repo convention — no route declares one; the contract is
 * asserted in tests via `BlastRadius.parse(res.json())`). No per-route rate
 * limit — the global 120/min covers it, and the optional LLM summary is off by
 * default.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BlastService(app.container);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams } },
    async (req): Promise<BlastRadius> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.forPull(workspaceId, req.params.id, app.log);
    },
  );
}
