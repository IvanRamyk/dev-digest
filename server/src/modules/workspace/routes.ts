import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { WorkspaceService, type WorkspaceOverview } from './service.js';

/**
 * F1 — workspace manager. Transport layer only: parses requests and delegates
 * to WorkspaceService.
 *   GET /workspace        → workspace info + cloneDir + cloned repos summary
 *
 * Cleanup/re-pull of individual repos is handled by the repos module
 * (refresh/delete); this surface gives the UI an overview.
 */
export default async function workspaceRoutes(app: FastifyInstance) {
  const service = new WorkspaceService(app.container);

  app.get('/workspace', async (req): Promise<WorkspaceOverview> => {
    const { workspaceId } = await getContext(app.container, req);
    return service.overview(workspaceId);
  });
}
