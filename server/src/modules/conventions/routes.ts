import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';
import { BulkStatusBody, ScanStatusFilter, UpdateConventionBody } from './schemas.js';

const ScanQuery = z.object({ status: ScanStatusFilter.optional() });

/**
 * Conventions module.
 *   GET    /repos/:id/conventions               → { scan, candidates }
 *   POST   /repos/:id/conventions/scan           → 202 { scan_id, job_id } | { scan_id, degraded, reason }
 *   GET    /repos/:id/conventions/scan           → ConventionScan | null   (poll target)
 *   PUT    /conventions/:id                      → ConventionCandidate    (accept/reject/un-decide/edit)
 *   POST   /repos/:id/conventions/bulk-status     → { updated }
 *   POST   /repos/:id/conventions/skill-preview   → SkillPreviewDto        (persists nothing)
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ConventionsService(container);
  // Registered once at plugin load — precedent: repo-intel/routes.ts.
  service.registerScanJobHandler();
  try {
    await service.reapStaleScans();
  } catch (err) {
    app.log.warn({ err: (err as Error).message }, 'convention scan reaping failed (non-fatal)');
  }

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams, querystring: ScanQuery } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const status = req.query.status ?? 'all';
      return service.getView(workspaceId, req.params.id, status);
    },
  );

  app.post('/repos/:id/conventions/scan', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const result = await service.startScan(workspaceId, req.params.id);
    reply.code(202);
    return result.jobId
      ? { scan_id: result.scanId, job_id: result.jobId }
      : { scan_id: result.scanId, degraded: true, reason: result.reason };
  });

  app.get('/repos/:id/conventions/scan', { schema: { params: IdParams } }, async (req) => {
    await getContext(container, req);
    return service.getScan(req.params.id);
  });

  app.put(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const updated = await service.updateCandidate(workspaceId, req.params.id, req.body);
      if (!updated) throw new NotFoundError('Convention candidate not found');
      return updated;
    },
  );

  app.post(
    '/repos/:id/conventions/bulk-status',
    { schema: { params: IdParams, body: BulkStatusBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const updated = await service.bulkUpdateStatus(workspaceId, req.body.ids, req.body.status);
      return { updated };
    },
  );

  app.post('/repos/:id/conventions/skill-preview', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.previewSkill(workspaceId, req.params.id);
  });
}
