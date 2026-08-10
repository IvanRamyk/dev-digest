import type {
  ChatMessage,
  ConventionCandidate,
  ConventionScan,
  LLMProvider,
  RepoRef,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError } from '../../platform/errors.js';
import { SettingsService } from '../settings/service.js';
import { langForFile, parseImports } from '../../adapters/astgrep/index.js';
import { ConventionsRepository } from './repository.js';
import {
  BATCH_CONCURRENCY,
  BATCH_SIZE,
  DEFAULT_MODEL,
  MAX_BATCHES,
  MAX_FILE_BYTES,
  SAMPLE_FILE_COUNT,
  SCAN_JOB_KIND,
  SCAN_SOFT_BUDGET_MS,
  STALE_SCAN_MS,
} from './constants.js';
import {
  buildSkillBody,
  computeConfidence,
  dedupeCandidates,
  findImportLine,
  groupFilesIntoBatches,
  isJunkRuleText,
  isPrettierRestatement,
  isSafeRepoRelativePath,
  isSamplePath,
  normalizeRuleKey,
  numberLines,
  toDto,
  toScanDto,
  type SkillBodyCandidate,
} from './helpers.js';
import { mineChokepoints, mineLayering, minePlacement, mineRoleContracts } from './miners.js';
import { parseEslintConfig, parsePackageJson, parsePrettierConfig, parseTsconfig, toRawCandidate } from './config-rules.js';
import { buildBatchUserMessage, buildPhraseMessage, EXTRACTION_SYSTEM_PROMPT, PHRASE_SYSTEM_PROMPT } from './prompts.js';
import { ConventionExtractionSchema, ConventionPhraseSchema, type ScanStatusFilter, type SkillPreviewDto } from './schemas.js';
import { ConventionVerifier } from './verifier.js';
import type { ConventionRow } from '../../db/rows.js';
import type { MinedPattern, RawCandidate, VerifiedCandidate } from './types.js';

/**
 * ConventionsService — the pipeline (S0–S9, see specs/conventions.md) plus
 * the read/write surface `routes.ts` calls. No HTTP, no raw SQL — all
 * persistence goes through `ConventionsRepository`.
 */

interface ModelStats {
  attempted: number;
  failed: number;
}

interface TokenCounter {
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

function addUsage(counter: TokenCounter, res: { tokensIn: number; tokensOut: number; costUsd: number | null }): void {
  counter.tokensIn += res.tokensIn;
  counter.tokensOut += res.tokensOut;
  counter.costUsd = counter.costUsd == null || res.costUsd == null ? null : counter.costUsd + res.costUsd;
}

export class ConventionsService {
  private repo: ConventionsRepository;
  private settings: SettingsService;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.settings = new SettingsService(container);
  }

  // -------------------------------------------------------------------------
  // Reads for routes.ts
  // -------------------------------------------------------------------------

  async getView(
    workspaceId: string,
    repoId: string,
    statusFilter: ScanStatusFilter,
  ): Promise<{ scan: ConventionScan | null; candidates: ConventionCandidate[] }> {
    const scan = await this.repo.getLatestScan(repoId);
    const status = statusFilter === 'all' ? undefined : statusFilter;
    const rows = await this.repo.listCandidates(workspaceId, repoId, status);
    return { scan: scan ? toScanDto(scan) : null, candidates: rows.map(toDto) };
  }

  async getScan(repoId: string): Promise<ConventionScan | null> {
    const scan = await this.repo.getLatestScan(repoId);
    return scan ? toScanDto(scan) : null;
  }

  async updateCandidate(
    workspaceId: string,
    id: string,
    patch: { status?: 'pending' | 'accepted' | 'rejected'; rule?: string },
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.repo.updateCandidate(workspaceId, id, patch);
    return row ? toDto(row) : undefined;
  }

  async bulkUpdateStatus(
    workspaceId: string,
    ids: string[],
    status: 'pending' | 'accepted' | 'rejected',
  ): Promise<number> {
    return this.repo.bulkUpdateStatus(workspaceId, ids, status);
  }

  async previewSkill(workspaceId: string, repoId: string): Promise<SkillPreviewDto> {
    const accepted = await this.repo.getAcceptedCandidates(workspaceId, repoId);
    if (accepted.length === 0) {
      throw new AppError('no_accepted_candidates', 'No accepted candidates to build a skill from', 400);
    }
    const repoBasics = await this.repo.getRepoBasics(repoId);
    const repoLabel = repoBasics?.fullName ?? 'repo';
    const slug = repoBasics?.name ?? 'repo';
    const body = buildSkillBody(repoLabel, accepted.map(toSkillBodyCandidate));
    return {
      name: `${slug}-conventions`,
      description: `House conventions extracted from ${repoLabel}.`,
      type: 'convention',
      body,
      candidate_count: accepted.length,
    };
  }

  // -------------------------------------------------------------------------
  // Scan lifecycle
  // -------------------------------------------------------------------------

  /** Insert the scan row, then enqueue in try/catch (precedent: repo-intel/routes.ts).
   *  An already-active scan short-circuits and returns its own id (double-click guard). */
  async startScan(
    workspaceId: string,
    repoId: string,
  ): Promise<{ scanId: string; jobId?: string; degraded?: true; reason?: string }> {
    const active = await this.repo.getActiveScan(repoId);
    if (active) return { scanId: active.id };

    const scan = await this.repo.insertScan({ workspaceId, repoId });
    try {
      const job = await this.container.jobs.enqueue(workspaceId, SCAN_JOB_KIND, { scanId: scan.id });
      return { scanId: scan.id, jobId: job.id };
    } catch {
      return { scanId: scan.id, degraded: true, reason: 'no_handler' };
    }
  }

  registerScanJobHandler(): void {
    this.container.jobs.register(SCAN_JOB_KIND, async (payload) => {
      const { scanId } = payload as { scanId: string };
      await this.runScan(scanId);
    });
  }

  /** Boot-time safety net: `JobRunner` is an in-memory queue, so any scan left
   *  `queued`/`running` from a prior process is permanently orphaned. */
  async reapStaleScans(): Promise<number> {
    return this.repo.reapStale(STALE_SCAN_MS);
  }

  /**
   * The job handler body. NEVER rethrows — `JobRunner` wraps handlers in
   * `withRetry(2)`, so a throw after N model calls would triple the bill.
   * Every failure path here writes a stable code to `convention_scans.error`
   * and resolves the scan (never left `running`).
   */
  async runScan(scanId: string): Promise<void> {
    const scan = await this.repo.getScanById(scanId);
    if (!scan || scan.status !== 'queued') return; // S0 — already claimed or gone

    await this.repo.updateScan(scanId, { status: 'running', startedAt: new Date() });

    try {
      await this.runScanInner(scanId, scan.workspaceId, scan.repoId);
    } catch {
      await this.repo.updateScan(scanId, { status: 'failed', error: 'internal_error', finishedAt: new Date() });
    }
  }

  // -------------------------------------------------------------------------
  // Pipeline
  // -------------------------------------------------------------------------

  private async runScanInner(scanId: string, workspaceId: string, repoId: string): Promise<void> {
    const scanStartedAt = Date.now();
    const repoBasics = await this.repo.getRepoBasics(repoId);
    if (!repoBasics || !repoBasics.clonePath) {
      await this.repo.updateScan(scanId, {
        status: 'failed',
        degradedReason: 'not_cloned',
        finishedAt: new Date(),
      });
      return;
    }
    const repoRef: RepoRef = { owner: repoBasics.owner, name: repoBasics.name };
    const git = this.container.git;

    // ---- S1: deterministic config rules — persisted immediately ----------
    const configCandidates = await this.collectConfigCandidates(git, repoRef);
    let candidatesKept = 0;
    for (const c of configCandidates) {
      await this.persistOne(workspaceId, repoId, scanId, configToVerified(c));
      candidatesKept++;
    }

    // ---- S2: samples -------------------------------------------------------
    const { paths, degradedReason: sampleDegradedReason } = await this.getSamplePaths(repoId, repoRef);
    if (paths.length === 0) {
      await this.repo.deleteStalePending(repoId, scanId);
      await this.repo.updateScan(scanId, {
        status: 'done',
        sampleFileCount: 0,
        batchCount: 0,
        candidatesFound: configCandidates.length,
        candidatesKept,
        degradedReason: sampleDegradedReason,
        finishedAt: new Date(),
      });
      return;
    }

    // ---- S3: read + number ---------------------------------------------
    const contentMap = await this.readSamples(git, repoRef, paths);

    // ---- S3b: structural mining ------------------------------------------
    const mined = await this.mine(repoId, contentMap);

    // ---- model resolution ---------------------------------------------
    const modelChoice = (await this.settings.featureModelOverride(workspaceId, 'conventions')) ?? DEFAULT_MODEL;
    const llm = await this.resolveLlmSafe(modelChoice.provider);
    const modelStats: ModelStats = { attempted: 0, failed: 0 };
    const tokenCounter: TokenCounter = { tokensIn: 0, tokensOut: 0, costUsd: 0 };

    // ---- S4a: phrase mined patterns ---------------------------------------
    const phrased = await this.phraseMinedPatterns(mined, llm, modelChoice.model, modelStats, tokenCounter);

    // ---- S4b: extract from file bodies ------------------------------------
    const batches = groupFilesIntoBatches(paths, BATCH_SIZE, MAX_BATCHES);
    const deadline = scanStartedAt + SCAN_SOFT_BUDGET_MS;
    let hitSoftBudget = false;
    const extracted =
      batches.length > 0
        ? await this.runBatchExtraction(batches, contentMap, llm, modelChoice.model, modelStats, tokenCounter, deadline, () => {
            hitSoftBudget = true;
          })
        : [];

    if (modelStats.attempted > 0 && modelStats.failed === modelStats.attempted) {
      await this.repo.deleteStalePending(repoId, scanId);
      await this.repo.updateScan(scanId, {
        status: 'failed',
        error: 'no_api_key',
        sampleFileCount: paths.length,
        batchCount: batches.length,
        candidatesFound: configCandidates.length,
        candidatesKept,
        provider: modelChoice.provider,
        model: modelChoice.model,
        finishedAt: new Date(),
      });
      return;
    }

    // ---- S5: reduce ---------------------------------------------------
    const raw = [...phrased, ...extracted].filter(
      (c) => !isJunkRuleText(c.rule) && !isPrettierRestatement(c.rule),
    );
    const reduced = dedupeCandidates(raw);
    // Judged in a STABLE order (evidence confidence proxy `rank` ASC, then
    // rule_key) so the same repo yields the same N judged rules across scans,
    // and the judge budget bites the weakest-evidence candidates first.
    const ordered = [...reduced].sort(
      (a, b) => a.rank - b.rank || normalizeRuleKey(a.rule).localeCompare(normalizeRuleKey(b.rule)),
    );

    // ---- S6: verify -----------------------------------------------------
    const verifier = new ConventionVerifier({ git, repo: repoRef, llm: llm ?? NULL_LLM, model: modelChoice.model });
    for (const candidate of ordered) {
      if (candidate.mined) {
        await this.persistOne(workspaceId, repoId, scanId, minedToVerified(candidate));
        candidatesKept++;
        continue;
      }
      const outcome = await verifier.verify(candidate, contentMap);
      if (outcome.kind === 'kept') {
        await this.persistOne(workspaceId, repoId, scanId, outcome.candidate);
        candidatesKept++;
      }
      // 'dropped' and 'refuted' are simply not persisted.
    }

    // ---- S7 tail: drop stale pending noise ---------------------------------
    await this.repo.deleteStalePending(repoId, scanId);

    // ---- S8: finish -----------------------------------------------------
    const degradedReason = sampleDegradedReason ?? (hitSoftBudget ? 'soft_budget' : null);
    await this.repo.updateScan(scanId, {
      status: 'done',
      sampleFileCount: paths.length,
      batchCount: batches.length,
      provider: modelChoice.provider,
      model: modelChoice.model,
      tokensIn: tokenCounter.tokensIn,
      tokensOut: tokenCounter.tokensOut,
      costUsd: tokenCounter.costUsd,
      candidatesFound: configCandidates.length + raw.length,
      candidatesKept,
      degradedReason,
      finishedAt: new Date(),
    });
  }

  private async persistOne(
    workspaceId: string,
    repoId: string,
    scanId: string,
    candidate: VerifiedCandidate,
  ): Promise<void> {
    await this.repo.upsertCandidate({
      workspaceId,
      repoId,
      scanId,
      ruleKey: normalizeRuleKey(candidate.rule),
      rule: candidate.rule,
      category: candidate.category,
      source: candidate.source,
      evidencePath: candidate.evidence.path,
      evidenceStartLine: candidate.evidence.startLine,
      evidenceEndLine: candidate.evidence.endLine,
      evidenceSnippet: candidate.evidence.snippet,
      verification: candidate.verification,
      supportCount: candidate.supportCount,
      violationCount: candidate.violationCount,
      confidence: candidate.confidence,
    });
  }

  // ---- S1 ---------------------------------------------------------------

  private async collectConfigCandidates(git: Container['git'], repo: RepoRef): Promise<RawCandidate[]> {
    const read = async (path: string): Promise<string | null> => {
      try {
        return await git.readFile(repo, path);
      } catch {
        return null;
      }
    };

    const out: RawCandidate[] = [];

    const eslintPath = '.eslintrc.json';
    const eslintRaw = await read(eslintPath);
    if (eslintRaw) for (const r of parseEslintConfig(eslintRaw, eslintPath)) out.push(toRawCandidate(r));

    const prettierPath = '.prettierrc';
    const prettierRaw = await read(prettierPath);
    if (prettierRaw) for (const r of parsePrettierConfig(prettierRaw, prettierPath)) out.push(toRawCandidate(r));

    const tsconfigPath = 'tsconfig.json';
    const tsconfigRaw = await read(tsconfigPath);
    if (tsconfigRaw) for (const r of parseTsconfig(tsconfigRaw, tsconfigPath)) out.push(toRawCandidate(r));

    const packageJsonPath = 'package.json';
    const packageJsonRaw = await read(packageJsonPath);
    if (packageJsonRaw) {
      for (const r of parsePackageJson(packageJsonRaw, packageJsonPath)) out.push(toRawCandidate(r));
      if (!eslintRaw) {
        try {
          const pkg = JSON.parse(packageJsonRaw) as { eslintConfig?: unknown };
          if (pkg.eslintConfig) {
            for (const r of parseEslintConfig(JSON.stringify(pkg.eslintConfig), packageJsonPath)) {
              out.push(toRawCandidate(r));
            }
          }
        } catch {
          // malformed package.json — already handled by parsePackageJson's own guard
        }
      }
    }

    return out;
  }

  // ---- S2 -----------------------------------------------------------------

  private async getSamplePaths(repoId: string, repo: RepoRef): Promise<{ paths: string[]; degradedReason: string | null }> {
    const ranked = await this.container.repoIntel.getConventionSamples(repoId, SAMPLE_FILE_COUNT);
    if (ranked.length > 0) return { paths: ranked, degradedReason: null };

    try {
      const matches = await this.container.codeIndex.grep(repo, '^\\s*(import|export)\\s');
      const distinct = [...new Set(matches.map((m) => m.path))].filter(isSamplePath).slice(0, SAMPLE_FILE_COUNT);
      if (distinct.length > 0) {
        const reason = this.container.config.repoIntelEnabled ? null : 'repo_intel_off';
        return { paths: distinct, degradedReason: reason };
      }
    } catch {
      // grep fallback itself failed — fall through to no_samples
    }
    return { paths: [], degradedReason: this.container.config.repoIntelEnabled ? 'no_samples' : 'repo_intel_off' };
  }

  // ---- S3 -----------------------------------------------------------------

  private async readSamples(git: Container['git'], repo: RepoRef, paths: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    for (const p of paths) {
      if (!isSafeRepoRelativePath(p)) continue;
      try {
        const content = await git.readFile(repo, p);
        const truncated = content.length > MAX_FILE_BYTES ? content.slice(0, MAX_FILE_BYTES) : content;
        map.set(p, truncated.split('\n'));
      } catch {
        // unreadable sample — skip, never fail the scan for one file
      }
    }
    return map;
  }

  // ---- S3b ------------------------------------------------------------

  private async mine(repoId: string, contentMap: Map<string, string[]>): Promise<MinedPattern[]> {
    const edges = await this.repo.getFileEdges(repoId);

    const externalImports: Array<{ file: string; source: string; line: number }> = [];
    for (const [path, lines] of contentMap) {
      const lang = langForFile(path);
      if (!lang) continue;
      try {
        for (const imp of parseImports(path, lines.join('\n'))) {
          if (imp.isType) continue;
          if (imp.source.startsWith('.') || imp.source.startsWith('/')) continue; // internal — not a chokepoint candidate
          externalImports.push({ file: path, source: imp.source, line: findImportLine(lines, imp.source) });
        }
      } catch {
        // unparseable sample — skip for mining purposes
      }
    }
    const chokepoints = mineChokepoints({ edges, externalImports });

    const endpointFiles = await this.repo.getEndpointFilePaths(repoId);
    const signatures = endpointFiles.length > 0 ? await this.repo.getExportedSignatures(repoId, endpointFiles) : [];
    const roleContracts = mineRoleContracts({ endpointFiles, signatures });

    const ranked = await this.container.repoIntel.getTopFilesByRank(repoId, 100_000);
    const allFiles = ranked.length > 0 ? ranked : [...contentMap.keys()];
    const layering = mineLayering({ edges, files: allFiles });
    const placement = minePlacement(allFiles);

    return [...chokepoints, ...roleContracts, ...layering, ...placement];
  }

  // ---- S4a ------------------------------------------------------------

  private async phraseMinedPatterns(
    patterns: MinedPattern[],
    llm: LLMProvider | null,
    model: string,
    modelStats: ModelStats,
    tokenCounter: TokenCounter,
  ): Promise<RawCandidate[]> {
    if (patterns.length === 0) return [];
    modelStats.attempted++;
    if (!llm) {
      modelStats.failed++;
      return [];
    }
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: PHRASE_SYSTEM_PROMPT },
        ...buildPhraseMessage(patterns),
      ];
      const res = await llm.completeStructured({
        model,
        schema: ConventionPhraseSchema,
        schemaName: 'ConventionPhrase',
        messages,
        temperature: 0,
        maxTokens: 1000,
      });
      addUsage(tokenCounter, res);
      const out: RawCandidate[] = [];
      patterns.forEach((p, i) => {
        const rule = res.data.rules[i]?.rule;
        if (!rule) return;
        out.push({
          rule,
          category: p.category,
          evidence: p.evidence,
          source: 'model',
          rank: 0,
          mined: { supportCount: p.supportCount, violationCount: p.violationCount },
        });
      });
      return out;
    } catch {
      modelStats.failed++;
      return [];
    }
  }

  // ---- S4b ------------------------------------------------------------

  private async runBatchExtraction(
    batches: string[][],
    contentMap: Map<string, string[]>,
    llm: LLMProvider | null,
    model: string,
    modelStats: ModelStats,
    tokenCounter: TokenCounter,
    deadline: number,
    onSoftBudget: () => void,
  ): Promise<RawCandidate[]> {
    const out: RawCandidate[] = [];
    for (let i = 0; i < batches.length; i += BATCH_CONCURRENCY) {
      if (Date.now() > deadline) {
        onSoftBudget();
        break;
      }
      const wave = batches.slice(i, i + BATCH_CONCURRENCY);
      const results = await Promise.all(
        wave.map((batch) => this.extractOneBatch(batch, contentMap, llm, model, modelStats, tokenCounter)),
      );
      for (const r of results) out.push(...r);
    }
    return out;
  }

  private async extractOneBatch(
    batch: string[],
    contentMap: Map<string, string[]>,
    llm: LLMProvider | null,
    model: string,
    modelStats: ModelStats,
    tokenCounter: TokenCounter,
  ): Promise<RawCandidate[]> {
    modelStats.attempted++;
    if (!llm) {
      modelStats.failed++;
      return [];
    }
    try {
      const files = batch.map((p) => ({ path: p, numbered: numberLines(contentMap.get(p) ?? []) }));
      const messages: ChatMessage[] = [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        ...buildBatchUserMessage(files),
      ];
      const res = await llm.completeStructured({
        model,
        schema: ConventionExtractionSchema,
        schemaName: 'ConventionExtraction',
        messages,
        temperature: 0,
        maxTokens: 1500,
      });
      addUsage(tokenCounter, res);
      return res.data.candidates.map((c) => ({
        rule: c.rule,
        category: c.category,
        evidence: {
          path: c.evidence_path,
          startLine: c.evidence_start_line,
          endLine: c.evidence_end_line,
          snippet: c.evidence_snippet,
        },
        source: 'model' as const,
        rank: 1,
        verifiable: c.verifiable,
        supportPattern: c.support_pattern ?? null,
        violationPattern: c.violation_pattern ?? null,
      }));
    } catch {
      modelStats.failed++;
      return [];
    }
  }

  private async resolveLlmSafe(provider: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider | null> {
    try {
      return await this.container.llm(provider);
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Pipeline-local mapping helpers
// ---------------------------------------------------------------------------

function configToVerified(raw: RawCandidate): VerifiedCandidate {
  return {
    rule: raw.rule,
    category: raw.category,
    evidence: raw.evidence,
    source: 'config',
    verification: 'config',
    supportCount: 0,
    violationCount: 0,
    confidence: computeConfidence(0, 0, 'config'),
  };
}

function minedToVerified(raw: RawCandidate): VerifiedCandidate {
  const mined = raw.mined!;
  return {
    rule: raw.rule,
    category: raw.category,
    evidence: raw.evidence,
    source: raw.source,
    verification: 'pattern',
    supportCount: mined.supportCount,
    violationCount: mined.violationCount,
    confidence: computeConfidence(mined.supportCount, mined.violationCount, 'pattern'),
  };
}

function toSkillBodyCandidate(row: ConventionRow): SkillBodyCandidate {
  return {
    rule: row.rule,
    category: row.category as SkillBodyCandidate['category'],
    source: row.source as SkillBodyCandidate['source'],
    evidencePath: row.evidencePath ?? '',
    evidenceStartLine: row.evidenceStartLine,
    evidenceEndLine: row.evidenceEndLine,
    supportCount: row.supportCount,
    violationCount: row.violationCount,
  };
}

/** Never actually called: the S6 verifier is only reached when `llm` resolved
 *  (batches/mined-phrasing already short-circuit to `failed` otherwise). Exists
 *  purely so `ConventionVerifier`'s constructor type stays non-nullable. */
const NULL_LLM: LLMProvider = {
  id: 'openai',
  listModels: () => Promise.resolve([]),
  complete: () => Promise.reject(new Error('unreachable')),
  completeStructured: () => Promise.reject(new Error('unreachable')),
  embed: () => Promise.resolve([]),
};
