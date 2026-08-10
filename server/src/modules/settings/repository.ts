import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * F1 — settings data-access layer. The ONLY place that touches the `settings`
 * table. Every query is scoped by `workspaceId` (tenancy guard).
 *
 * Settings are stored as one row per key; the flat `Settings` object the API
 * speaks is folded from those rows by `helpers.rowsToSettings`.
 */

/** One persisted settings key/value row. `value` is untyped `jsonb`. */
export interface SettingsRow {
  key: string;
  value: unknown;
}

export class SettingsRepository {
  constructor(private db: Db) {}

  /** All settings rows for a workspace (both the well-known keys and extras). */
  async listForWorkspace(workspaceId: string): Promise<SettingsRow[]> {
    return this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
  }

  /** Insert-or-replace one key. Conflict target is the workspace+user+key unique index. */
  async upsert(workspaceId: string, userId: string, key: string, value: unknown): Promise<void> {
    await this.db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoUpdate({
        target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
        set: { value },
      });
  }
}
