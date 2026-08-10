import type { Container } from '../../platform/container.js';
import { WorkspaceRepository } from './repository.js';
import { toWorkspaceRepoSummary, type WorkspaceRepoSummary } from './helpers.js';

/**
 * F1 — workspace service. Business logic for the Workspace manager: where clones
 * live plus a summary of the workspace's repos.
 *
 * No HTTP and no raw SQL live here — persistence goes through
 * WorkspaceRepository, pure transforms through helpers.ts.
 */

/** What `GET /workspace` answers with. */
export interface WorkspaceOverview {
  workspaceId: string;
  cloneDir: string;
  repos: WorkspaceRepoSummary[];
}

export class WorkspaceService {
  private repo: WorkspaceRepository;

  constructor(private container: Container) {
    this.repo = new WorkspaceRepository(container.db);
  }

  /**
   * Workspace overview. `cloneDir` is a process-level config value (not a
   * column), so it comes off the container rather than the repository.
   */
  async overview(workspaceId: string): Promise<WorkspaceOverview> {
    const rows = await this.repo.listRepos(workspaceId);
    return {
      workspaceId,
      cloneDir: this.container.config.cloneDir,
      repos: rows.map(toWorkspaceRepoSummary),
    };
  }
}
