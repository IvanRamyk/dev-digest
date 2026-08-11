import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { Intent } from '@devdigest/shared';

/**
 * Intent data-access — the ONLY drizzle site for this module (onion O6). It owns
 * the `pr_intent` reads/writes THIS module needs.
 *
 * `pr_intent` is also touched by `modules/reviews/repository/pull.repo.ts` (the
 * executor path). Both write the same table from their OWN module rather than
 * importing a sibling's data layer (O7 forbids importing a sibling's repo, not
 * two modules touching one table). The widened column set and the DTO mapping
 * are kept identical in both so a read from either place yields the same shape.
 */
export class IntentRepository {
  constructor(private db: Db) {}

  /** The stored intent for a PR, mapped into the widened `Intent` DTO, or null. */
  async getForPr(prId: string): Promise<Intent | null> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    if (!row) return null;
    return {
      intent: row.intent,
      in_scope: row.inScope,
      out_of_scope: row.outOfScope,
      // Legacy rows predate the widened columns; the DB defaults ('low', '[]')
      // guarantee a well-formed DTO without fabricating a field.
      confidence: (row.confidence as Intent['confidence']) ?? 'low',
      sources: row.sources ?? [],
      missing_context: row.missingContext ?? [],
    };
  }

  /** Whether a PR already has a derived intent (drives the polling re-derive gate). */
  async hasIntent(prId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ prId: t.prIntent.prId })
      .from(t.prIntent)
      .where(eq(t.prIntent.prId, prId));
    return !!row;
  }

  /** Upsert a derived intent, recording the classifier model and bumping derived_at. */
  async upsert(prId: string, intent: Intent, model: string | null): Promise<void> {
    const values = {
      prId,
      intent: intent.intent,
      inScope: intent.in_scope,
      outOfScope: intent.out_of_scope,
      confidence: intent.confidence,
      sources: intent.sources,
      missingContext: intent.missing_context,
      model,
      derivedAt: new Date(),
    };
    await this.db
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
}
