import type { BlastRadius, ChatMessage, Provider } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { SettingsService } from '../settings/service.js';
import { BlastRepository } from './repository.js';
import { buildSummaryPrompt, mapBlastResult } from './helpers.js';
import {
  BLAST_SUMMARY_FEATURE,
  BLAST_SUMMARY_MAX_CHARS,
  BLAST_SUMMARY_SYSTEM_PROMPT,
} from './constants.js';

/** Minimal structured logger (pino-compatible) — the service logs its own step. */
type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

/**
 * BlastService — read-and-shape over the repo-intel facade. Shape: impure
 * (load pull + changed files + facade reads) → pure (`mapBlastResult`) →
 * optional impure (the flag-gated one-paragraph LLM summary).
 *
 * No HTTP, no drizzle here: the tenancy gate and changed-file read go through
 * `BlastRepository`; the impact data and index state through
 * `container.repoIntel` (which degrades, never throws); the optional summary
 * through `container.llm` with the model resolved via Settings.
 */
export class BlastService {
  private repo: BlastRepository;
  private settings: SettingsService;

  constructor(private container: Container) {
    this.repo = new BlastRepository(container.db);
    this.settings = new SettingsService(container);
  }

  async forPull(workspaceId: string, prId: string, log?: Logger): Promise<BlastRadius> {
    // ---- impure: load pull (tenancy) + changed files ----------------------
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const files = await this.repo.listChangedFilePaths(prId);

    // ---- impure: facade reads (never throw; empty/degraded is data) -------
    const [result, indexState] = await Promise.all([
      this.container.repoIntel.getBlastRadius(pull.repoId, files),
      this.container.repoIntel.getIndexState(pull.repoId),
    ]);

    // ---- pure: map facade result → wire contract --------------------------
    const map = mapBlastResult(result, indexState);

    // ---- optional impure: flag-gated one-paragraph summary ----------------
    if (this.container.config.blastSummaryEnabled) {
      map.summary = await this.summarize(workspaceId, prId, map, log);
    }

    return map;
  }

  /**
   * Optional one-paragraph summary. Names/counts only (via `buildSummaryPrompt`)
   * — never diff bodies. Resolves the model via Settings and calls the plain
   * completion. On ANY failure it keeps the deterministic `map.summary`, so a
   * flaky model never degrades the map. The model writes only prose; nodes and
   * links are already fixed by `mapBlastResult`.
   */
  private async summarize(
    workspaceId: string,
    prId: string,
    map: BlastRadius,
    log?: Logger,
  ): Promise<string> {
    try {
      const userContent = buildSummaryPrompt(map);
      const messages: ChatMessage[] = [
        { role: 'system', content: BLAST_SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ];
      const choice = await this.settings.resolveFeatureModel(workspaceId, BLAST_SUMMARY_FEATURE);
      const llm = await this.container.llm(choice.provider as Provider);

      // Observability: model + counts + a token estimate. NEVER a secret, and
      // the prompt carries names/counts only (no diff bodies).
      log?.info(
        {
          prId,
          model: choice.model,
          provider: choice.provider,
          changedSymbols: map.changed_symbols.length,
          downstream: map.downstream.length,
          tokenEst: Math.ceil(userContent.length / 4),
          promptComponents: ['symbol_names', 'caller_counts', 'endpoints', 'crons'],
        },
        'blast: summarising (optional, flag on)',
      );

      const res = await llm.complete({
        model: choice.model,
        messages,
        temperature: 0,
        maxTokens: Math.ceil(BLAST_SUMMARY_MAX_CHARS / 4),
      });
      const text = res.text.trim();
      return text.length > 0 ? text : map.summary;
    } catch (err) {
      log?.warn({ prId, err: String(err) }, 'blast: summary failed, using deterministic fallback');
      return map.summary;
    }
  }
}
