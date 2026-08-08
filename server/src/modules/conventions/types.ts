import type { ConventionCategory, ConventionVerification } from '@devdigest/shared';

/**
 * Internal pipeline types shared by miners.ts, verifier.ts, service.ts, and
 * helpers.ts. Not persisted directly — repository.ts maps to/from DB rows,
 * helpers.ts `toDto` maps rows to the wire contract.
 */

export interface Evidence {
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
}

/**
 * A candidate rule before verification.
 *
 * `rank` is the confidence-of-evidence ordering key used both to break dedupe
 * ties and to decide judge order when the S6b budget is scarce: 0 = mined by
 * code (S3b/S4a phrasing, config), 1 = raw model extraction (S4b). Lower wins.
 */
export interface RawCandidate {
  rule: string;
  category: ConventionCategory;
  evidence: Evidence;
  source: 'config' | 'model';
  rank: number;
  /** Config rules and S4a-phrased mined patterns skip verification entirely —
   *  `verifiable` is only present for raw S4b model output. */
  verifiable?: 'pattern' | 'semantic';
  supportPattern?: string | null;
  violationPattern?: string | null;
  /** Present when the rule was mined (S3b) — support/violation already counted
   *  from the graph population, which is stronger evidence than any pattern
   *  match. Skips S6a/S6b entirely. */
  mined?: { supportCount: number; violationCount: number };
  /** Config rules carry a fixed verification+confidence and skip S6 outright. */
  preVerified?: { verification: 'config'; supportCount: number; violationCount: number };
}

/** A candidate that survived S6 verification, ready for S7 persist. */
export interface VerifiedCandidate {
  rule: string;
  category: ConventionCategory;
  evidence: Evidence;
  source: 'config' | 'model';
  verification: ConventionVerification;
  supportCount: number;
  violationCount: number;
  confidence: number;
}

/** Output of a single S3b miner — a graph/population-proven pattern, not yet
 *  phrased into English (that's S4a's job). */
export interface MinedPattern {
  kind: 'chokepoint' | 'role_contract' | 'layering' | 'placement';
  category: ConventionCategory;
  /** Facts the phrasing model is instructed to phrase, not infer. */
  facts: Record<string, unknown>;
  evidence: Evidence;
  supportCount: number;
  violationCount: number;
}
