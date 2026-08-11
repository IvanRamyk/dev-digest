import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { SmartDiff } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SmartDiffService } from './service.js';

/**
 * Smart Diff module. Transport only: parse the request, delegate to
 * SmartDiffService.
 *   GET /pulls/:id/smart-diff → the PR's files regrouped by review risk
 *                               (core → wiring → boilerplate), with per-line
 *                               finding lines from each agent's latest run.
 *
 * No `response` schema (no route in this codebase declares one; the contract is
 * asserted in tests via `SmartDiff.parse(res.json())`). No per-route rate limit —
 * the global 120/min covers it and there is no expensive call to protect.
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SmartDiffService(app.container);

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams } },
    async (req): Promise<SmartDiff> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.forPull(workspaceId, req.params.id);
    },
  );
}
