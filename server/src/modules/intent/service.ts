import type { Container } from '../../platform/container.js';
import type { ChatMessage, Intent, IntentSource, Provider } from '@devdigest/shared';
import { Intent as IntentSchema } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { SettingsService } from '../settings/service.js';
import { loadDiff } from '../reviews/diff-loader.js';
import { IntentRepository } from './repository.js';
import {
  INTENT_FEATURE,
  INTENT_MAX_BODY_CHARS,
  INTENT_SYSTEM_PROMPT,
} from './constants.js';
import {
  extractHunkHeaders,
  formatHunkHeaders,
  formatIntentSources,
  estimateTokens,
} from './helpers.js';

/** Minimal structured logger (pino-compatible) — the service logs its own step. */
type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

/** Regex for a linked issue in a PR body — mirrors the octokit adapter's own. */
const LINKED_ISSUE_RE = /(?:closes|fixes|resolves)\s+#(\d+)/i;
/** In-repo plan/spec refs in a PR body: allowlisted paths under specs/ or docs/. */
const PLAN_SPEC_RE = /\b((?:specs|docs)\/[\w./-]+\.md)\b/gi;

/**
 * IntentService — derives a PR's intent & scope with a CHEAP classifier, a
 * second LLM call distinct from the review itself. Shape: impure (gather) →
 * pure (build prompt) → impure (classify + persist). No HTTP, no drizzle here:
 * persistence goes through `IntentRepository`, GitHub through `container.github()`.
 */
export class IntentService {
  private repo: IntentRepository;
  private settings: SettingsService;

  constructor(private container: Container) {
    this.repo = new IntentRepository(container.db);
    this.settings = new SettingsService(container);
  }

  /** Read the stored intent for a PR (workspace-scoped via the PR). */
  async get(workspaceId: string, prId: string): Promise<Intent | null> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('PR not found');
    return this.repo.getForPr(prId);
  }

  /** Whether a PR already has a derived intent (polling re-derive gate). */
  hasIntent(prId: string): Promise<boolean> {
    return this.repo.hasIntent(prId);
  }

  /**
   * Derive (or re-derive) the intent for a PR and persist it. Loud on a missing
   * PR (NotFound); the CLASSIFIER call itself may still fail — callers on the
   * best-effort paths (executor, polling) wrap this in try/catch and degrade.
   */
  async derive(workspaceId: string, prId: string, log?: Logger): Promise<Intent> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('PR not found');
    const repoRow = await this.container.reviewRepo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');

    // ---- impure: gather sources -------------------------------------------
    const diff = await loadDiff(this.container, this.container.reviewRepo, workspaceId, pull, repoRow);
    const { text: externalText, sources, missing } = await this.gatherLinkedSources(
      repoRow.owner,
      repoRow.name,
      pull.body ?? '',
    );

    // The always-present sources: title, body, and the changed file list.
    const baseSources: IntentSource[] = [
      { type: 'pr_title', ref: pull.title, status: 'available' },
      {
        type: 'pr_body',
        ref: 'pr_body',
        status: pull.body && pull.body.trim().length > 0 ? 'available' : 'missing',
      },
      { type: 'files', ref: `${diff.files.length} changed file(s)`, status: 'available' },
    ];
    const allSources = [...baseSources, ...sources];

    // ---- pure: build the classifier prompt --------------------------------
    const hunkHeaders = formatHunkHeaders(extractHunkHeaders(diff));
    const userContent = this.buildUserPrompt(pull.title, pull.body ?? '', externalText, hunkHeaders);
    const messages: ChatMessage[] = [
      { role: 'system', content: INTENT_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ];

    // ---- impure: resolve model + provider, then classify ------------------
    const choice = await this.settings.resolveFeatureModel(workspaceId, INTENT_FEATURE);
    const llm = await this.container.llm(choice.provider as Provider);

    // Observability: one structured log with model + sources + a token estimate.
    // NEVER a secret, NEVER a diff body (only headers went into the prompt).
    log?.info(
      {
        prId,
        model: choice.model,
        provider: choice.provider,
        sources: formatIntentSources(allSources),
        tokenEst: estimateTokens(userContent),
        promptComponents: ['title', 'body', 'linked_sources', 'file_headers'],
      },
      'intent: deriving (cheap classifier)',
    );

    // No explicit type param: `Intent` has `.default()` fields, so its Zod INPUT
    // type (defaulted fields optional) differs from its OUTPUT type. Passing
    // `<Intent>` (the output) clashes with `z.ZodType<T>`'s invariant input;
    // letting inference resolve `T` from the schema keeps both sides aligned.
    const res = await llm.completeStructured({
      model: choice.model,
      schema: IntentSchema,
      schemaName: 'Intent',
      messages,
      temperature: 0,
    });

    // Parse the model output through the schema once so defaulted fields (e.g.
    // `confidence`) resolve to their OUTPUT type — the invariant `z.ZodType<T>`
    // otherwise infers the defaulted-optional INPUT shape.
    const classified = IntentSchema.parse(res.data);

    // Assemble the persisted Intent: the model's classification, but with OUR
    // recorded sources + missing_context — never the model's self-report of what
    // it saw, so a fabricated source can't slip in.
    const intent: Intent = {
      intent: classified.intent,
      in_scope: classified.in_scope,
      out_of_scope: classified.out_of_scope,
      // Downgrade confidence when the body was empty — the model only had the
      // title + file names + headers to go on.
      confidence:
        pull.body && pull.body.trim().length > 0 ? classified.confidence : 'low',
      sources: allSources,
      missing_context: missing,
    };

    await this.repo.upsert(prId, intent, choice.model);
    return intent;
  }

  /**
   * Resolve linked issue + allowlisted plan/spec refs from the PR body. Returns
   * the concatenated untrusted text (bodies), the per-source status list, and
   * the `missing_context` notes. Never throws; an unreachable source is marked
   * `missing`, never fabricated.
   */
  private async gatherLinkedSources(
    owner: string,
    name: string,
    body: string,
  ): Promise<{ text: string; sources: IntentSource[]; missing: string[] }> {
    const gh = await this.container.github();
    const sources: IntentSource[] = [];
    const missing: string[] = [];
    const textParts: string[] = [];

    // Linked issue (closes/fixes/resolves #N).
    const issueMatch = body.match(LINKED_ISSUE_RE);
    if (issueMatch?.[1]) {
      const n = Number(issueMatch[1]);
      try {
        const issue = await gh.getIssue({ owner, name }, n);
        sources.push({ type: 'issue', ref: `#${n}`, status: 'available' });
        textParts.push(`Linked issue #${n}: ${issue.title}\n${issue.body ?? ''}`);
      } catch {
        sources.push({ type: 'issue', ref: `#${n}`, status: 'missing' });
        missing.push(`linked issue #${n} could not be fetched`);
      }
    }

    // Plan/spec refs — allowlisted in-repo paths only. Dedupe repeats.
    const refs = new Set<string>();
    for (const m of body.matchAll(PLAN_SPEC_RE)) if (m[1]) refs.add(m[1]);
    for (const ref of refs) {
      const file = await gh.getRepoFile({ owner, name }, ref);
      const type: IntentSource['type'] = ref.startsWith('specs/') ? 'spec' : 'plan';
      if (file.status === 'available') {
        sources.push({ type, ref, status: 'available' });
        textParts.push(`${type} ${ref}:\n${file.text}`);
      } else {
        sources.push({ type, ref, status: 'missing' });
        missing.push(`${type} ${ref} could not be fetched`);
      }
    }

    return { text: textParts.join('\n\n'), sources, missing };
  }

  /** Pure prompt assembly — title + (truncated) body + linked text + headers. */
  private buildUserPrompt(
    title: string,
    body: string,
    externalText: string,
    hunkHeaders: string,
  ): string {
    const parts: string[] = [`PR title: ${title}`];
    const trimmedBody = body.trim();
    parts.push(
      trimmedBody.length > 0
        ? `PR description:\n${trimmedBody.slice(0, INTENT_MAX_BODY_CHARS)}`
        : 'PR description: (empty)',
    );
    if (externalText.trim().length > 0) {
      parts.push(`Linked context:\n${externalText.slice(0, INTENT_MAX_BODY_CHARS)}`);
    }
    parts.push(`Changed files and hunk headers (NO code bodies):\n${hunkHeaders}`);
    return parts.join('\n\n');
  }

  /** Map the persisted Intent DTO → the engine's plain scope string-bag. */
  static toEngineIntent(intent: Intent): {
    summary: string;
    inScope: string[];
    outOfScope: string[];
  } {
    return {
      summary: intent.intent,
      inScope: intent.in_scope,
      outOfScope: intent.out_of_scope,
    };
  }
}
