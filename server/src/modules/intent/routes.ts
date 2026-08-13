import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Intent } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { IntentService } from './service.js';

/**
 * Intent module. Transport layer only — parse the request, resolve tenancy,
 * one service call, return.
 *   POST /pulls/:id/intent  → derive/re-derive the PR's intent (200 Intent)
 *   GET  /pulls/:id/intent  → the stored intent, or null (never reviewed)
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new IntentService(app.container);

  app.post('/pulls/:id/intent', { schema: { params: IdParams } }, async (req): Promise<Intent> => {
    const { workspaceId } = await getContext(app.container, req);
    return service.derive(workspaceId, req.params.id, app.log);
  });

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams } },
    async (req): Promise<Intent | null> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );
}
