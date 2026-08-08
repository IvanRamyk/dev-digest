import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  doublePrecision,
  boolean,
  vector,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/**
 * One conventions-extraction run over a repo. Exists separately from the
 * in-memory `jobs` queue for three reasons: the UI header needs durable
 * "detected from N sample files · last scan Xh ago" copy, polling `jobs` would
 * report a stuck/orphaned job as success (the queue is in-memory — rows orphan
 * on restart), and cost must be attributed per scan.
 */
export const conventionScans = pgTable(
  'convention_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['queued', 'running', 'done', 'failed'] })
      .notNull()
      .default('queued'),
    sampleFileCount: integer('sample_file_count').notNull().default(0),
    batchCount: integer('batch_count').notNull().default(0),
    provider: text('provider'),
    model: text('model'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    costUsd: doublePrecision('cost_usd'),
    candidatesFound: integer('candidates_found').notNull().default(0),
    candidatesKept: integer('candidates_kept').notNull().default(0),
    /** 'no_samples' | 'repo_intel_off' | 'not_cloned' | 'soft_budget' — set even on a 'done' scan. */
    degradedReason: text('degraded_reason'),
    /** A STABLE CODE only, never a raw provider message (key leakage). */
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: now(),
  },
  (t) => ({ repoIdx: index('convention_scans_repo_idx').on(t.repoId, t.createdAt) }),
);

export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    /** `SET NULL`, not cascade — pruning old scans must never delete an accepted rule. */
    scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'set null' }),
    /** Normalized dedupe slug — load-bearing: makes re-scan an upsert that
     *  preserves the user's accept/reject decisions across re-scans. */
    ruleKey: text('rule_key').notNull(),
    category: text('category', {
      enum: [
        'naming',
        'error_handling',
        'structure',
        'testing',
        'imports',
        'typing',
        'logging',
        'api',
        'formatting',
        'other',
      ],
    })
      .notNull()
      .default('other'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    /** Config rules are exempt from the drop-generic-advice rule at extraction time. */
    source: text('source', { enum: ['config', 'model'] })
      .notNull()
      .default('model'),
    rule: text('rule').notNull(),
    evidencePath: text('evidence_path'),
    evidenceStartLine: integer('evidence_start_line'),
    evidenceEndLine: integer('evidence_end_line'),
    evidenceSnippet: text('evidence_snippet'),
    /** HOW support was established — drives the UI badge and the confidence cap. */
    verification: text('verification', { enum: ['config', 'pattern', 'semantic', 'unverified'] })
      .notNull()
      .default('unverified'),
    supportCount: integer('support_count').notNull().default(0),
    violationCount: integer('violation_count').notNull().default(0),
    confidence: doublePrecision('confidence'),
    /** Legacy mirror of `status === 'accepted'` — PluginConvention
     *  (vendor/shared/contracts/productionize.ts) still reads this boolean. */
    accepted: boolean('accepted').notNull().default(false),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    repoStatusIdx: index('conventions_repo_status_idx').on(t.repoId, t.status),
    scanIdx: index('conventions_scan_idx').on(t.scanId),
    repoRuleKeyUq: uniqueIndex('conventions_repo_rule_key_uq').on(t.repoId, t.ruleKey),
  }),
);
