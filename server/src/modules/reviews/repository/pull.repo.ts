import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Intent } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

export async function upsertIntent(
  db: Db,
  prId: string,
  intent: Intent,
  model?: string | null,
): Promise<void> {
  const values = {
    prId,
    intent: intent.intent,
    inScope: intent.in_scope,
    outOfScope: intent.out_of_scope,
    confidence: intent.confidence,
    sources: intent.sources,
    missingContext: intent.missing_context,
    model: model ?? null,
    // Every write is a (re-)derivation — bump the timestamp so the UI and the
    // polling head-move path can tell a re-run from a stale read.
    derivedAt: new Date(),
  };
  await db
    .insert(t.prIntent)
    .values(values)
    .onConflictDoUpdate({
      target: t.prIntent.prId,
      set: {
        intent: values.intent,
        inScope: values.inScope,
        outOfScope: values.outOfScope,
        confidence: values.confidence,
        sources: values.sources,
        missingContext: values.missingContext,
        model: values.model,
        derivedAt: values.derivedAt,
      },
    });
}

export async function getIntent(db: Db, prId: string): Promise<Intent | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  // Legacy rows predate the widened columns; the DB defaults ('low', '[]') mean
  // a read always yields a well-formed Intent DTO without a fabricated field.
  return {
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: (row.confidence as Intent['confidence']) ?? 'low',
    sources: row.sources ?? [],
    missing_context: row.missingContext ?? [],
  };
}
