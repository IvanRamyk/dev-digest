import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';
import { IMPORT_BODY_LIMIT_BYTES } from './constants.js';

/**
 * A1 — skills module (the missing module).
 *   GET    /skills                              → Skill[]
 *   GET    /skills/:id                          → Skill
 *   POST   /skills                              → Skill
 *   PUT    /skills/:id                          → Skill
 *   DELETE /skills/:id                          → { ok: true }
 *   GET    /skills/:id/versions                 → SkillVersion[]
 *   POST   /skills/:id/versions/:version/restore→ Skill
 *   POST   /skills/import/preview               → SkillImportPreview   (saves nothing)
 *   POST   /skills/import                       → Skill                (after confirm)
 */

/** `/skills/:id/versions/:version/restore` — id is a uuid, version a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().min(1),
  enabled: z.boolean().optional(),
  evidence_files: z.array(z.string()).nullish(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().optional(),
  enabled: z.boolean().optional(),
});

/** JSON transport (not multipart): the client base64-encodes the file body. */
const ImportFileBody = z.object({
  filename: z.string().min(1),
  content_base64: z.string().min(1),
});

const SkippedEntry = z.object({
  path: z.string(),
  bytes: z.number().int(),
  reason: z.enum(['not_processed', 'unsafe_path']),
});

const SkillImportPreviewDto = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  source: z.enum(['manual', 'imported_url', 'extracted', 'community']),
  skipped: z.array(SkippedEntry),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post(
    '/skills',
    { schema: { body: CreateSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const body = req.body;
      const skill = await service.create(workspaceId, {
        name: body.name,
        body: body.body,
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        evidenceFiles: body.evidence_files ?? null,
      });
      reply.status(201);
      return skill;
    },
  );

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restoreVersion(workspaceId, req.params.id, req.params.version);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  // Per-route bodyLimit override: the global cap (app.ts) is 1 MB and must stay
  // that low for every other route; a base64-encoded zip needs more headroom.
  app.post(
    '/skills/import/preview',
    {
      bodyLimit: IMPORT_BODY_LIMIT_BYTES,
      schema: { body: ImportFileBody },
    },
    async (req) => {
      await getContext(app.container, req);
      return service.previewImport(req.body.filename, req.body.content_base64);
    },
  );

  app.post(
    '/skills/import',
    {
      bodyLimit: IMPORT_BODY_LIMIT_BYTES,
      schema: { body: SkillImportPreviewDto },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.confirmImport(workspaceId, req.body);
      reply.status(201);
      return skill;
    },
  );
}
