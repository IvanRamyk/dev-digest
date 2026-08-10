import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { PollingRepository } from './repository.js';

/**
 * F1 — polling service. The MANUAL refresh: sync a repo's PR list from GitHub
 * (new/updated PRs appear, head_sha updates) and bump `last_polled_at`.
 *
 * No HTTP and no raw SQL live here — GitHub goes through `container.github()`,
 * persistence through PollingRepository.
 *
 * Unlike the local-first reads in `modules/pulls`, this path deliberately does
 * NOT degrade: an explicit refresh that cannot reach GitHub has to fail loudly,
 * because reporting `synced: 0` would look like "the repo has no PRs" instead of
 * "we never asked". A missing token therefore propagates as ConfigError.
 */

/** The poll's response shape: how many PRs were synced, and that nothing ran. */
export interface PollResult {
  synced: number;
  reviewTriggered: boolean;
}

export class PollingService {
  private repo: PollingRepository;

  constructor(private container: Container) {
    this.repo = new PollingRepository(container.db);
  }

  /**
   * Sync the PR list for one repo. Import is idempotent (unique repo_id+number),
   * so re-polling updates in place instead of duplicating.
   *
   * No review is triggered here — review is manual (user presses Run Review,
   * owned by A2).
   */
  async pollRepo(workspaceId: string, repoId: string): Promise<PollResult> {
    const repo = await this.repo.findRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const gh = await this.container.github();
    const pulls = await gh.listPullRequests({ owner: repo.owner, name: repo.name });
    let synced = 0;
    for (const pr of pulls) {
      await this.repo.upsertPull({
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
        updatedAt: pr.updated_at ? new Date(pr.updated_at) : null,
      });
      synced++;
    }
    await this.repo.touchLastPolledAt(repo.id, new Date());

    return { synced, reviewTriggered: false };
  }
}
