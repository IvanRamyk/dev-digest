import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { PrMeta, PrDetail, GitHubClient, PrReviewComment } from '@devdigest/shared';
import { PrCommentInput } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { deriveReviewStatus, findingsBySeverity } from './status.js';

/**
 * F1 — pulls module. PR import via Octokit (list + per-PR detail).
 *   GET /repos/:id/pulls → list PRs for a repo (open + recently merged/closed,
 *                          synced from GitHub, persisted). `status` is GitHub's
 *                          merge state (open/merged/closed).
 *   GET /pulls/:id       → full PR detail (diff/files, commits, body, linked issue)
 *
 * Import is idempotent (unique repo_id+number). Review trigger is MANUAL
 * and owned by A2 — this module only imports/reads.
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await getContext(container, req);
    const [repo] = await container.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
    if (!repo) throw new NotFoundError('Repo not found');

    let gh: GitHubClient | null = null;
    try {
      gh = await container.github();
    } catch (err) {
      app.log.warn({ err }, 'GitHub client unavailable (no token / offline); serving persisted PRs');
    }

    // Local-first: sync from GitHub when a token is configured, but never
    // fail the read — already-imported/seeded PRs stay viewable offline.
    if (gh) {
      try {
        const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
        for (const pr of pulls) {
          await container.db
            .insert(t.pullRequests)
            .values({
              workspaceId,
              repoId: repo.id,
              number: pr.number,
              title: pr.title,
              author: pr.author,
              branch: pr.branch,
              base: pr.base,
              headSha: pr.head_sha,
              additions: pr.additions,
              deletions: pr.deletions,
              filesCount: pr.files_count,
              status: pr.status,
              openedAt: pr.opened_at ? new Date(pr.opened_at) : null,
              updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
            })
            .onConflictDoUpdate({
              target: [t.pullRequests.repoId, t.pullRequests.number],
              set: {
                title: pr.title,
                headSha: pr.head_sha,
                status: pr.status,
                updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
              },
            });
        }
      } catch (err) {
        app.log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
      }
    }

    const rows = await container.db
      .select()
      .from(t.pullRequests)
      .where(eq(t.pullRequests.repoId, repo.id));

    // Diff stats aren't on GitHub's PR-list payload, so freshly-imported PRs
    // land with zeroed size/diff. Backfill them once from the detail endpoint
    // so the list shows real S/M/L + ± counts. Capped per request (each backfill
    // is a detail fetch) — the periodic refetch chips away at any remainder.
    const BACKFILL_LIMIT = 10;
    if (gh) {
      const needStats = rows
        .filter((r) => r.additions === 0 && r.deletions === 0 && r.filesCount === 0)
        .slice(0, BACKFILL_LIMIT);
      for (const r of needStats) {
        try {
          const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
          await container.db
            .update(t.pullRequests)
            .set({
              additions: detail.additions,
              deletions: detail.deletions,
              filesCount: detail.files_count,
            })
            .where(eq(t.pullRequests.id, r.id));
          r.additions = detail.additions;
          r.deletions = detail.deletions;
          r.filesCount = detail.files_count;
        } catch (err) {
          app.log.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
        }
      }
    }

    // Latest-review SCORE per PR for the list's score ring. Computed on read
    // from reviews (no FK denorm); the list is small, so one IN-query + JS
    // grouping is cheap.
    const prIds = rows.map((r) => r.id);
    const latestReviewByPr = new Map<string, { score: number | null }>();
    if (prIds.length > 0) {
      const reviewRows = await container.db
        .select({ prId: t.reviews.prId, score: t.reviews.score })
        .from(t.reviews)
        .where(and(inArray(t.reviews.prId, prIds), eq(t.reviews.kind, 'review')))
        .orderBy(desc(t.reviews.createdAt));
      // Rows are newest-first → first seen per PR is the latest review.
      for (const rv of reviewRows) {
        if (!latestReviewByPr.has(rv.prId)) latestReviewByPr.set(rv.prId, { score: rv.score });
      }
    }

    // TOTAL COST per PR: the sum of each agent's LATEST run. Reviewing a PR with
    // three agents costs three runs, so the column has to answer "what did this
    // PR cost me", not "what did the last agent cost" — those differ by 3-5x.
    // Summing every run ever would instead keep growing across re-runs and never
    // match a single review, so older attempts by the SAME agent are superseded
    // rather than added.
    //
    // An agent whose LATEST run has no price contributes NOTHING — it does not
    // fall through to that agent's older priced run. A superseded run describes a
    // review that no longer exists, and quietly resurrecting its figure makes the
    // column describe a mix of the current attempt and an abandoned one. This is
    // why unpriced runs are NOT filtered out in SQL: the failed newest row has to
    // be visible here to win the (pr, agent) slot and suppress its predecessor.
    //
    // A null total still means "no priced run", never "free" — free models
    // legitimately store 0, so the key is only created on a real contribution.
    const costByPr = new Map<string, number>();
    if (prIds.length > 0) {
      const runRows = await container.db
        .select({
          prId: t.agentRuns.prId,
          agentId: t.agentRuns.agentId,
          costUsd: t.agentRuns.costUsd,
        })
        .from(t.agentRuns)
        .where(inArray(t.agentRuns.prId, prIds))
        .orderBy(desc(t.agentRuns.ranAt));
      // Rows are newest-first, so the first (pr, agent) pair seen is that agent's
      // latest run. Deleted agents leave agent_id NULL (ON DELETE SET NULL) and
      // are indistinguishable from each other, so they share ONE bucket — that
      // undercounts an orphaned batch, but never double-counts one agent's retries.
      const seen = new Set<string>();
      for (const r of runRows) {
        if (!r.prId) continue;
        const key = `${r.prId}:${r.agentId ?? 'orphaned'}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Slot taken either way: an unpriced latest run suppresses this agent's
        // older runs instead of deferring to them.
        if (r.costUsd == null) continue;
        costByPr.set(r.prId, (costByPr.get(r.prId) ?? 0) + r.costUsd);
      }
    }

    // FINDINGS per severity: the tally over each agent's LATEST RUN, keyed on
    // agent_runs rather than on reviews, and matching cost_usd above.
    //
    // Keying on runs is what makes a dead newest run suppress its predecessor.
    // insertReview only runs on the success path (reviews/run-executor.ts), so a
    // failed / cancelled / still-running run writes NO reviews row at all — a
    // reviews-keyed query cannot see that the agent has been re-run and silently
    // reports the older attempt's findings as if they were current. A `running`
    // run therefore also contributes nothing until it settles: mid-review the
    // column goes quiet instead of asserting a stale picture.
    //
    // The two LEFT JOINs each preserve a distinct "reviewed, and clean" case:
    // runs→reviews keeps a run whose review has not landed, reviews→findings
    // keeps a review that found nothing. Unknown severities are dropped by
    // findingsBySeverity, never bucketed.
    const findingsByPr = new Map<string, { severity: string }[]>();
    if (prIds.length > 0) {
      const runFindingRows = await container.db
        .select({
          prId: t.agentRuns.prId,
          agentId: t.agentRuns.agentId,
          runId: t.agentRuns.id,
          severity: t.findings.severity,
        })
        .from(t.agentRuns)
        .leftJoin(t.reviews, eq(t.reviews.runId, t.agentRuns.id))
        .leftJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
        .where(inArray(t.agentRuns.prId, prIds))
        .orderBy(desc(t.agentRuns.ranAt));
      // Rows are newest-first, so the first (pr, agent) pair seen is that agent's
      // latest run; every earlier run by the same agent is superseded. Deleted
      // agents leave agent_id NULL and share ONE bucket — that undercounts an
      // orphaned batch, but never double-counts one agent's retries.
      const keptRunIds = new Set<string>();
      const seenAgents = new Set<string>();
      for (const row of runFindingRows) {
        if (!row.prId) continue;
        const agentKey = `${row.prId}:${row.agentId ?? 'orphaned'}`;
        if (!seenAgents.has(agentKey)) {
          seenAgents.add(agentKey);
          keptRunIds.add(row.runId);
        }
        // The entry itself (even when empty) is what makes the value non-null.
        if (!findingsByPr.has(row.prId)) findingsByPr.set(row.prId, []);
        if (keptRunIds.has(row.runId) && row.severity != null) {
          findingsByPr.get(row.prId)!.push({ severity: row.severity });
        }
      }

      // Reviews with NO run behind them: the seeded demo review (db/seed.ts) and
      // any review whose run row was deleted. Nothing can supersede them — there
      // is no newer run by "their" agent to win the slot — so they always count.
      // Without this the seeded PR would report {0,0,0} and its visible findings
      // would vanish from the column.
      const orphanRows = await container.db
        .select({ prId: t.reviews.prId, severity: t.findings.severity })
        .from(t.reviews)
        .leftJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
        .where(and(inArray(t.reviews.prId, prIds), isNull(t.reviews.runId)));
      for (const row of orphanRows) {
        if (!findingsByPr.has(row.prId)) findingsByPr.set(row.prId, []);
        if (row.severity != null) findingsByPr.get(row.prId)!.push({ severity: row.severity });
      }
    }

    const now = Date.now();
    return rows.map((r) => {
      const review = latestReviewByPr.get(r.id);
      const prFindings = findingsByPr.get(r.id);
      return {
        id: r.id,
        number: r.number,
        title: r.title,
        author: r.author,
        branch: r.branch,
        base: r.base,
        head_sha: r.headSha,
        additions: r.additions,
        deletions: r.deletions,
        files_count: r.filesCount,
        status: deriveReviewStatus({
          ghStatus: r.status,
          lastReviewedSha: r.lastReviewedSha,
          headSha: r.headSha,
          updatedAt: r.updatedAt,
          now,
        }),
        opened_at: r.openedAt?.toISOString() ?? null,
        updated_at: r.updatedAt?.toISOString() ?? null,
        score: review ? review.score : null,
        cost_usd: costByPr.get(r.id) ?? null,
        // null = never reviewed; {0,0,0} = reviewed and clean. Not the same thing.
        findings_by_severity: prFindings ? findingsBySeverity(prFindings) : null,
      };
    });
  });

  app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
    const { workspaceId } = await getContext(container, req);
    const [pr] = await container.db
      .select()
      .from(t.pullRequests)
      .where(
        and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, req.params.id)),
      );
    if (!pr) throw new NotFoundError('Pull request not found');
    const [repo] = await container.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.id, pr.repoId));
    if (!repo) throw new NotFoundError('Repo not found');

    // Local-first: refresh detail from GitHub when a token is configured;
    // otherwise serve the persisted files/commits/body (seeded or previously
    // imported) so PR detail works offline.
    try {
      const gh = await container.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);

      await container.db.delete(t.prFiles).where(eq(t.prFiles.prId, pr.id));
      if (detail.files.length > 0) {
        await container.db.insert(t.prFiles).values(
          detail.files.map((f) => ({
            prId: pr.id,
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ?? null,
          })),
        );
      }
      await container.db.delete(t.prCommits).where(eq(t.prCommits.prId, pr.id));
      if (detail.commits.length > 0) {
        await container.db.insert(t.prCommits).values(
          detail.commits.map((c) => ({
            prId: pr.id,
            sha: c.sha,
            message: c.message,
            author: c.author,
            committedAt: c.committed_at ? new Date(c.committed_at) : null,
          })),
        );
      }
      await container.db
        .update(t.pullRequests)
        .set({
          body: detail.body ?? null,
          // Diff stats aren't on GitHub's PR-list payload — backfill them from
          // the detail fetch so the Pull Requests list shows real size/files.
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        })
        .where(eq(t.pullRequests.id, pr.id));

      return { ...detail, id: pr.id };
    } catch (err) {
      app.log.warn({ err }, 'GitHub PR detail refresh skipped (no token / offline); serving persisted detail');
      const files = await container.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id));
      const commits = await container.db.select().from(t.prCommits).where(eq(t.prCommits.prId, pr.id));
      return {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        author: pr.author,
        branch: pr.branch,
        base: pr.base,
        head_sha: pr.headSha,
        additions: pr.additions,
        deletions: pr.deletions,
        files_count: pr.filesCount,
        status: pr.status as PrDetail['status'],
        opened_at: pr.openedAt?.toISOString() ?? null,
        updated_at: pr.updatedAt?.toISOString() ?? null,
        body: pr.body ?? null,
        files: files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
        commits: commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          committed_at: c.committedAt?.toISOString() ?? null,
        })),
      };
    }
  });

  // ---- Inline review comments (Files changed tab) -------------------------
  // Proxied live to GitHub (no local persistence): GET reflects existing PR
  // comments; POST creates one immediately. Keeps the tab in lock-step with
  // GitHub and avoids a stale local mirror.
  async function resolvePrAndRepo(id: string, workspaceId: string) {
    const [pr] = await container.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, id)));
    if (!pr) throw new NotFoundError('Pull request not found');
    const [repo] = await container.db.select().from(t.repos).where(eq(t.repos.id, pr.repoId));
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams } },
    async (req): Promise<PrReviewComment[]> => {
      const { workspaceId } = await getContext(container, req);
      const { pr, repo } = await resolvePrAndRepo(req.params.id, workspaceId);
      let gh: GitHubClient;
      try {
        gh = await container.github();
      } catch (err) {
        app.log.warn({ err }, 'GitHub client unavailable; serving no PR comments');
        return [];
      }
      try {
        return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
      } catch (err) {
        app.log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
        return [];
      }
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req): Promise<PrReviewComment> => {
      const { workspaceId } = await getContext(container, req);
      const { pr, repo } = await resolvePrAndRepo(req.params.id, workspaceId);
      const input = req.body;
      let gh: GitHubClient;
      try {
        gh = await container.github();
      } catch {
        throw new AppError(
          'github_unavailable',
          'Connect a GitHub token to post comments.',
          400,
        );
      }
      try {
        return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
          commitId: pr.headSha,
          path: input.path,
          line: input.line,
          ...(input.side ? { side: input.side } : {}),
          body: input.body,
          ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
        });
      } catch (err) {
        // GitHub rejects comments on lines outside the diff / on closed PRs (422).
        const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
        throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
      }
    },
  );
}
