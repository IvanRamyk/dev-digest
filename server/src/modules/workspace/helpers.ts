import type { RepoRow } from '../../db/rows.js';

/**
 * F1 — workspace pure transforms. No DB, no `this`, no I/O: row → transport
 * shape only, so the summary's wire format unit-tests without Postgres.
 */

/** One repo in the workspace overview — clone state, not the full `Repo` DTO. */
export interface WorkspaceRepoSummary {
  id: string;
  full_name: string;
  clone_path: string | null;
  last_polled_at: string | null;
  cloned: boolean;
}

/** Map a persisted repo row to its workspace-overview summary. */
export function toWorkspaceRepoSummary(row: RepoRow): WorkspaceRepoSummary {
  return {
    id: row.id,
    full_name: row.fullName,
    clone_path: row.clonePath,
    last_polled_at: row.lastPolledAt?.toISOString() ?? null,
    // A repo exists as a row from the moment it is added; the clone lands later
    // (async `clone` job), so the path is what says whether it is on disk yet.
    cloned: Boolean(row.clonePath),
  };
}
