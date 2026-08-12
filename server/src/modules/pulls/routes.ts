import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrMeta, PrDetail, PrReviewComment } from '@devdigest/shared';
import { PrCommentInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { PullsService } from './service.js';

/**
 * F1 — pulls module. Transport layer only: parses requests and delegates to
 * PullsService.
 *   GET  /repos/:id/pulls    → list PRs for a repo (open + recently merged/closed,
 *                              synced from GitHub, persisted). `status` is GitHub's
 *                              merge state (open/merged/closed).
 *   GET  /pulls/:id          → full PR detail (diff/files, commits, body)
 *   GET  /pulls/:id/comments → inline review comments, proxied live
 *   POST /pulls/:id/comments → create one inline review comment
 *
 * Import is idempotent (unique repo_id+number). Review trigger is MANUAL
 * and owned by A2 — this module only imports/reads.
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new PullsService(app.container);

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listForRepo(workspaceId, req.params.id, app.log);
  });

  app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getDetail(workspaceId, req.params.id, app.log);
  });

  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams } },
    async (req): Promise<PrReviewComment[]> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listComments(workspaceId, req.params.id, app.log);
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req): Promise<PrReviewComment> => {
      const { workspaceId } = await getContext(app.container, req);
      return service.createComment(workspaceId, req.params.id, req.body);
    },
  );

  // Activity summary for the repo overview: per-PR review + finding counts,
  // newest PR first. Powers the "N reviews · M findings" row on each pull
  // request in the repo dashboard.
  app.get('/repos/:id/activity', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const [repo] = await container.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
    if (!repo) throw new NotFoundError('Repo not found');

    const prs = await container.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repo.id))
      .orderBy(desc(t.pullRequests.number));

    const summary = [];
    for (const pr of prs) {
      const reviews = await container.db
        .select()
        .from(t.reviews)
        .where(eq(t.reviews.prId, pr.id));

      let findings = 0;
      for (const review of reviews) {
        const rows = await container.db
          .select()
          .from(t.findings)
          .where(eq(t.findings.reviewId, review.id));
        findings += rows.length;
      }

      summary.push({ number: pr.number, title: pr.title, reviews: reviews.length, findings });
    }

    return summary;
  });
}
