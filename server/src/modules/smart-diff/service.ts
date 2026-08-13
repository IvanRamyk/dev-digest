import type { SmartDiff } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { SmartDiffRepository } from './repository.js';
import { buildGroups, buildSplitSuggestion, currentFindingRows } from './helpers.js';

/**
 * Smart Diff service. Reorders a PR's changed files by review risk and overlays
 * per-line finding marks — deterministically, with NO LLM call. It joins two
 * things the app already persists: `pr_files` (path + churn) and the current
 * findings (each agent's latest run).
 *
 * Impure → pure, with no write at the end: load the pull (404 if absent),
 * `Promise.all` the three row sets, then fold through
 * `currentFindingRows → buildGroups → buildSplitSuggestion`. No HTTP, no SQL, no
 * adapter, no LLM, no writes live here.
 */
export class SmartDiffService {
  private repo: SmartDiffRepository;

  constructor(container: Container) {
    this.repo = new SmartDiffRepository(container.db);
  }

  async forPull(workspaceId: string, prId: string): Promise<SmartDiff> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [files, runRows, orphanRows] = await Promise.all([
      this.repo.listFiles(prId),
      this.repo.listRunFindingLocations(prId),
      this.repo.listOrphanFindingLocations(prId),
    ]);

    const locations = currentFindingRows(runRows, orphanRows);
    const groups = buildGroups(files, locations);
    const split_suggestion = buildSplitSuggestion(groups);

    return { groups, split_suggestion };
  }
}
