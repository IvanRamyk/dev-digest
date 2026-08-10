import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { RepoRow } from '../../db/rows.js';
import * as t from '../../db/schema.js';

/**
 * F1 — workspace data-access layer. The ONLY place in this module that touches
 * the `repos` table, and read-only: the workspace overview never writes. Every
 * query is scoped by `workspaceId` (tenancy guard).
 */

export type { RepoRow };

export class WorkspaceRepository {
  constructor(private db: Db) {}

  /** Every repo in a workspace, for the clone summary. */
  async listRepos(workspaceId: string): Promise<RepoRow[]> {
    return this.db.select().from(t.repos).where(eq(t.repos.workspaceId, workspaceId));
  }
}
