import type { GitHubClient, PrDetail, PrMeta, PrReviewComment } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { PullRow, RepoRow } from '../../db/rows.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { PullsRepository } from './repository.js';
import {
  foldCostByPr,
  foldFindingsByPr,
  foldLatestScoreByPr,
  needsDiffStatBackfill,
  toPrDetail,
  toPrMeta,
} from './helpers.js';
import { DIFF_STAT_BACKFILL_LIMIT } from './constants.js';

/**
 * F1 — pulls service. PR import via the GitHubClient adapter (list + per-PR
 * detail) and the PR-list rollups.
 *
 * No HTTP and no raw SQL live here — persistence goes through PullsRepository,
 * pure folds through helpers.ts, literals through constants.ts.
 *
 * Every read is LOCAL-FIRST: a missing token or an offline GitHub degrades to
 * the persisted rows and never fails the request. That contract is why the
 * GitHub calls below are individually wrapped rather than guarded once.
 */

/** What the caller needs to log a degraded GitHub path. */
export interface DegradeLogger {
  warn(obj: Record<string, unknown>, msg: string): void;
}

export class PullsService {
  private repo: PullsRepository;

  constructor(private container: Container) {
    this.repo = new PullsRepository(container.db);
  }

  /**
   * Sync a repo's PRs from GitHub (best-effort), then return the list with its
   * score / cost / findings rollups.
   */
  async listForRepo(workspaceId: string, repoId: string, log: DegradeLogger): Promise<PrMeta[]> {
    const repo = await this.repo.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.tryGitHub(log, 'GitHub client unavailable (no token / offline); serving persisted PRs');
    if (gh) await this.syncFromGitHub(workspaceId, repo, gh, log);

    const rows = await this.repo.listByRepo(repo.id);
    if (gh) await this.backfillDiffStats(rows, repo, gh, log);

    return this.rollup(rows);
  }

  /**
   * Full PR detail. Refreshes from GitHub when a token is configured, else
   * serves the persisted files/commits/body so detail works offline.
   */
  async getDetail(workspaceId: string, id: string, log: DegradeLogger): Promise<PrDetail> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, id);
    try {
      const gh = await this.container.github();
      const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);
      await this.repo.replaceDetail(pr.id, {
        files: detail.files.map((f) => ({
          path: f.path,
          additions: f.additions,
          deletions: f.deletions,
          patch: f.patch ?? null,
        })),
        commits: detail.commits.map((c) => ({
          sha: c.sha,
          message: c.message,
          author: c.author,
          committedAt: c.committed_at ? new Date(c.committed_at) : null,
        })),
        body: detail.body ?? null,
        // Diff stats aren't on GitHub's PR-list payload — backfill them from
        // the detail fetch so the Pull Requests list shows real size/files.
        stats: {
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        },
      });
      return { ...detail, id: pr.id };
    } catch (err) {
      log.warn({ err }, 'GitHub PR detail refresh skipped (no token / offline); serving persisted detail');
      const [files, commits] = await Promise.all([
        this.repo.listFiles(pr.id),
        this.repo.listCommits(pr.id),
      ]);
      return toPrDetail(pr, files, commits);
    }
  }

  /**
   * Inline review comments, proxied live to GitHub with no local persistence —
   * keeps the Files-changed tab in lock-step instead of mirroring it staler.
   */
  async listComments(workspaceId: string, id: string, log: DegradeLogger): Promise<PrReviewComment[]> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, id);
    const gh = await this.tryGitHub(log, 'GitHub client unavailable; serving no PR comments');
    if (!gh) return [];
    try {
      return await gh.listReviewComments({ owner: repo.owner, name: repo.name }, pr.number);
    } catch (err) {
      log.warn({ err }, 'GitHub review-comments fetch skipped (offline / error)');
      return [];
    }
  }

  async createComment(
    workspaceId: string,
    id: string,
    input: {
      path: string;
      line: number;
      side?: string | undefined;
      body: string;
      in_reply_to?: number | undefined;
    },
  ): Promise<PrReviewComment> {
    const { pr, repo } = await this.resolvePrAndRepo(workspaceId, id);
    let gh: GitHubClient;
    try {
      gh = await this.container.github();
    } catch {
      throw new AppError('github_unavailable', 'Connect a GitHub token to post comments.', 400);
    }
    try {
      return await gh.createReviewComment({ owner: repo.owner, name: repo.name }, pr.number, {
        commitId: pr.headSha,
        path: input.path,
        line: input.line,
        ...(input.side ? { side: input.side as 'LEFT' | 'RIGHT' } : {}),
        body: input.body,
        ...(input.in_reply_to != null ? { inReplyTo: input.in_reply_to } : {}),
      });
    } catch (err) {
      // GitHub rejects comments on lines outside the diff / on closed PRs (422).
      const msg = err instanceof Error ? err.message : 'Failed to post the comment to GitHub.';
      throw new AppError('github_comment_failed', msg, 400, { cause: String(err) });
    }
  }

  // ---- internals ----------------------------------------------------------

  private async resolvePrAndRepo(
    workspaceId: string,
    id: string,
  ): Promise<{ pr: PullRow; repo: RepoRow }> {
    const pr = await this.repo.findPull(workspaceId, id);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.repo.findRepoById(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { pr, repo };
  }

  /** Resolve the GitHub client, or null when there is no usable token. */
  private async tryGitHub(log: DegradeLogger, msg: string): Promise<GitHubClient | null> {
    try {
      return await this.container.github();
    } catch (err) {
      log.warn({ err }, msg);
      return null;
    }
  }

  /** Import is idempotent (unique repo_id+number) and never fails the read. */
  private async syncFromGitHub(
    workspaceId: string,
    repo: RepoRow,
    gh: GitHubClient,
    log: DegradeLogger,
  ): Promise<void> {
    try {
      const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
      for (const pr of pulls) {
        await this.repo.upsert({
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
        });
      }
    } catch (err) {
      log.warn({ err }, 'GitHub PR sync skipped (no token / offline); serving persisted PRs');
    }
  }

  /**
   * Freshly-imported PRs land with zeroed size/diff, so backfill them once from
   * the detail endpoint. Mutates `rows` in place: the caller is about to build
   * the response from them and the fresh figures belong in THIS response, not
   * only the next one.
   */
  private async backfillDiffStats(
    rows: PullRow[],
    repo: RepoRow,
    gh: GitHubClient,
    log: DegradeLogger,
  ): Promise<void> {
    const needStats = rows.filter(needsDiffStatBackfill).slice(0, DIFF_STAT_BACKFILL_LIMIT);
    for (const r of needStats) {
      try {
        const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, r.number);
        const stats = {
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        };
        await this.repo.updateDiffStats(r.id, stats);
        Object.assign(r, stats);
      } catch (err) {
        log.warn({ err, number: r.number }, 'PR diff-stat backfill skipped');
      }
    }
  }

  /**
   * Score / cost / findings per PR. Computed on read (no FK denorm); the list is
   * small, so three IN-queries plus pure folds beat maintaining denormalised
   * columns.
   */
  private async rollup(rows: PullRow[]): Promise<PrMeta[]> {
    const prIds = rows.map((r) => r.id);
    const [scoreRows, costRows, runFindingRows, orphanRows] = await Promise.all([
      this.repo.listReviewScores(prIds),
      this.repo.listRunCosts(prIds),
      this.repo.listRunFindings(prIds),
      this.repo.listOrphanFindings(prIds),
    ]);

    const scoreByPr = foldLatestScoreByPr(scoreRows);
    const costByPr = foldCostByPr(costRows);
    const findingsByPr = foldFindingsByPr(runFindingRows, orphanRows);

    const now = Date.now();
    return rows.map((r) =>
      toPrMeta(r, {
        score: scoreByPr.get(r.id),
        hasReview: scoreByPr.has(r.id),
        costUsd: costByPr.get(r.id),
        findings: findingsByPr.get(r.id),
        now,
      }),
    );
  }
}
