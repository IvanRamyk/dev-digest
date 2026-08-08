import { and, desc, eq, inArray, isNotNull, lt, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionCategory, ConventionStatus } from '@devdigest/shared';

/**
 * All Drizzle for both `conventions` and `convention_scans`, plus the graph
 * reads the S3b miners need (`file_edges`, `file_facts`, `symbols`). The
 * repo-intel facade (`modules/repo-intel/types.ts`) exposes none of these as
 * raw rows — extending it would mean a generic "give me every edge" method
 * with exactly one caller. Querying the tables here directly is a mild
 * layering smell (repo-intel "owns" those tables); it is the faster, scoped
 * choice, and the tables themselves are stable (T2 of repo-intel, unlikely to
 * reshape under this module's feet).
 */

export type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';

export interface InsertScan {
  workspaceId: string;
  repoId: string;
}

export interface ScanUpdate {
  status?: 'queued' | 'running' | 'done' | 'failed';
  sampleFileCount?: number;
  batchCount?: number;
  provider?: string | null;
  model?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  costUsd?: number | null;
  candidatesFound?: number;
  candidatesKept?: number;
  degradedReason?: string | null;
  error?: string | null;
  startedAt?: Date;
  finishedAt?: Date;
}

export interface UpsertConvention {
  workspaceId: string;
  repoId: string;
  scanId: string;
  ruleKey: string;
  rule: string;
  category: ConventionCategory;
  source: 'config' | 'model';
  evidencePath: string;
  evidenceStartLine: number | null;
  evidenceEndLine: number | null;
  evidenceSnippet: string;
  verification: 'config' | 'pattern' | 'semantic' | 'unverified';
  supportCount: number;
  violationCount: number;
  confidence: number;
}

export interface CandidatePatch {
  status?: ConventionStatus;
  rule?: string;
}

export interface FileEdgeRow {
  fromFile: string;
  toFile: string;
}

export interface ExportedSignatureRow {
  path: string;
  name: string;
  line: number;
  signature: string;
}

export interface RepoBasics {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  clonePath: string | null;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  /** Minimal repo shape the pipeline needs: whether it's cloned, and its
   *  display name for the skill body header. */
  async getRepoBasics(repoId: string): Promise<RepoBasics | null> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
      })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row ?? null;
  }

  // -------------------------------------------------------------------------
  // Scans
  // -------------------------------------------------------------------------

  async insertScan(values: InsertScan): Promise<ConventionScanRow> {
    const [row] = await this.db
      .insert(t.conventionScans)
      .values({ workspaceId: values.workspaceId, repoId: values.repoId })
      .returning();
    return row!;
  }

  async getScanById(id: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db.select().from(t.conventionScans).where(eq(t.conventionScans.id, id));
    return row;
  }

  /** A scan already in flight for this repo, if any — powers the double-click guard. */
  async getActiveScan(repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(and(eq(t.conventionScans.repoId, repoId), inArray(t.conventionScans.status, ['queued', 'running'])))
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row;
  }

  /** Most recent scan for a repo, any status — the poll target / header copy. */
  async getLatestScan(repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(eq(t.conventionScans.repoId, repoId))
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row;
  }

  async updateScan(id: string, patch: ScanUpdate): Promise<void> {
    await this.db.update(t.conventionScans).set(patch).where(eq(t.conventionScans.id, id));
  }

  /** Mark any scan still `queued`/`running` older than `maxAgeMs` as `failed`.
   *  Boot-time safety net: `JobRunner` is an in-memory queue, so a restart
   *  orphans anything mid-flight (server/CLAUDE.md gotcha). Returns the count
   *  reaped. */
  async reapStale(maxAgeMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const rows = await this.db
      .update(t.conventionScans)
      .set({ status: 'failed', error: 'stale_job', finishedAt: new Date() })
      .where(and(inArray(t.conventionScans.status, ['queued', 'running']), lt(t.conventionScans.createdAt, cutoff)))
      .returning({ id: t.conventionScans.id });
    return rows.length;
  }

  // -------------------------------------------------------------------------
  // Candidates
  // -------------------------------------------------------------------------

  async listCandidates(
    workspaceId: string,
    repoId: string,
    status?: ConventionStatus,
  ): Promise<ConventionRow[]> {
    const where = status
      ? and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId), eq(t.conventions.status, status))
      : and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId));
    return this.db.select().from(t.conventions).where(where);
  }

  async getAcceptedCandidates(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.listCandidates(workspaceId, repoId, 'accepted');
  }

  async getCandidateById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  /**
   * S7 persist — upsert on `(repo_id, rule_key)`. On conflict, refresh
   * evidence/confidence/counts/scan_id, but NEVER touch `status`/`accepted`
   * (that's the user's decision — re-scanning must not silently un-accept or
   * un-reject a rule), and update `rule` text only while the row is still
   * `pending` (an edited-then-accepted rule keeps the user's wording).
   */
  async upsertCandidate(values: UpsertConvention): Promise<void> {
    await this.db
      .insert(t.conventions)
      .values({
        workspaceId: values.workspaceId,
        repoId: values.repoId,
        scanId: values.scanId,
        ruleKey: values.ruleKey,
        rule: values.rule,
        category: values.category,
        source: values.source,
        evidencePath: values.evidencePath,
        evidenceStartLine: values.evidenceStartLine,
        evidenceEndLine: values.evidenceEndLine,
        evidenceSnippet: values.evidenceSnippet,
        verification: values.verification,
        supportCount: values.supportCount,
        violationCount: values.violationCount,
        confidence: values.confidence,
      })
      .onConflictDoUpdate({
        target: [t.conventions.repoId, t.conventions.ruleKey],
        set: {
          rule: sql`CASE WHEN ${t.conventions.status} = 'pending' THEN excluded.rule ELSE ${t.conventions.rule} END`,
          category: sql`excluded.category`,
          evidencePath: sql`excluded.evidence_path`,
          evidenceStartLine: sql`excluded.evidence_start_line`,
          evidenceEndLine: sql`excluded.evidence_end_line`,
          evidenceSnippet: sql`excluded.evidence_snippet`,
          verification: sql`excluded.verification`,
          supportCount: sql`excluded.support_count`,
          violationCount: sql`excluded.violation_count`,
          confidence: sql`excluded.confidence`,
          scanId: sql`excluded.scan_id`,
          updatedAt: sql`now()`,
        },
      });
  }

  /** Update status (accept/reject/un-decide) and/or edit the rule text. The
   *  legacy `accepted` boolean mirrors `status === 'accepted'`; editing `rule`
   *  never recomputes `rule_key`, so an edit doesn't create a duplicate row on
   *  the next scan. */
  async updateCandidate(workspaceId: string, id: string, patch: CandidatePatch): Promise<ConventionRow | undefined> {
    const set: Partial<typeof t.conventions.$inferInsert> = { updatedAt: new Date() };
    if (patch.status !== undefined) {
      set.status = patch.status;
      set.accepted = patch.status === 'accepted';
    }
    if (patch.rule !== undefined) set.rule = patch.rule;
    const [row] = await this.db
      .update(t.conventions)
      .set(set)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  async bulkUpdateStatus(workspaceId: string, ids: string[], status: ConventionStatus): Promise<number> {
    if (ids.length === 0) return 0;
    const rows = await this.db
      .update(t.conventions)
      .set({ status, accepted: status === 'accepted', updatedAt: new Date() })
      .where(and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)))
      .returning({ id: t.conventions.id });
    return rows.length;
  }

  /** S7 tail — drop stale noise: any `pending` row from a PRIOR scan that
   *  wasn't re-found in this one. Accepted/rejected rows are untouched
   *  regardless of scan, by construction (only `pending` is targeted). */
  async deleteStalePending(repoId: string, scanId: string): Promise<number> {
    const rows = await this.db
      .delete(t.conventions)
      .where(
        and(
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'pending'),
          ne(t.conventions.scanId, scanId),
        ),
      )
      .returning({ id: t.conventions.id });
    return rows.length;
  }

  // -------------------------------------------------------------------------
  // S3b miner reads
  // -------------------------------------------------------------------------

  /** Full internal import graph for a repo (file_edges). */
  async getFileEdges(repoId: string): Promise<FileEdgeRow[]> {
    return this.db
      .select({ fromFile: t.fileEdges.fromFile, toFile: t.fileEdges.toFile })
      .from(t.fileEdges)
      .where(eq(t.fileEdges.repoId, repoId));
  }

  /** Distinct file paths carrying at least one HTTP endpoint registration —
   *  the role-contract miner's population. */
  async getEndpointFilePaths(repoId: string): Promise<string[]> {
    const rows = await this.db
      .select({ filePath: t.fileFacts.filePath, endpoints: t.fileFacts.endpoints })
      .from(t.fileFacts)
      .where(eq(t.fileFacts.repoId, repoId));
    return rows.filter((r) => Array.isArray(r.endpoints) && r.endpoints.length > 0).map((r) => r.filePath);
  }

  /** Exported, signature-bearing symbols for a repo, optionally restricted to
   *  a set of paths (role-contract miner scopes this to the endpoint population). */
  async getExportedSignatures(repoId: string, paths?: string[]): Promise<ExportedSignatureRow[]> {
    const where =
      paths && paths.length > 0
        ? and(eq(t.symbols.repoId, repoId), isNotNull(t.symbols.signature), inArray(t.symbols.path, paths))
        : and(eq(t.symbols.repoId, repoId), isNotNull(t.symbols.signature));
    const rows = await this.db
      .select({ path: t.symbols.path, name: t.symbols.name, line: t.symbols.line, signature: t.symbols.signature })
      .from(t.symbols)
      .where(and(where, eq(t.symbols.exported, true)));
    return rows
      .filter((r): r is { path: string; name: string; line: number; signature: string } => r.signature != null)
      .map((r) => ({ path: r.path, name: r.name, line: r.line ?? 1, signature: r.signature }));
  }
}
