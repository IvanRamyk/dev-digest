import type { ConventionCategory } from '@devdigest/shared';

/** Constants for the conventions module. */

// ---------------------------------------------------------------------------
// Job / scan
// ---------------------------------------------------------------------------

export const SCAN_JOB_KIND = 'conventions-scan';

/** How many top-ranked files `repoIntel.getConventionSamples` returns. */
export const SAMPLE_FILE_COUNT = 40;
/** Files per S4b batch (grouped by first path segment). */
export const BATCH_SIZE = 8;
/** Hard cap on S4b extraction calls per scan. */
export const MAX_BATCHES = 6;
/** How many batches run concurrently per wave. */
export const BATCH_CONCURRENCY = 3;
/** Per-file truncation before it enters a prompt or the S3 content map. */
export const MAX_FILE_BYTES = 20_000;
/** Below this, a pattern match is noise, not a convention (S6a refutation). */
export const MIN_SUPPORT_FILES = 2;
/** Ceiling on ripgrep calls per scan (S2 fallback sampler + any S6a retriever use). */
export const MAX_GREPS_PER_SCAN = 60;
/** ± line window the evidence anchor searches before self-healing. */
export const EVIDENCE_LINE_TOLERANCE = 2;
/** Hard cap on S6b LLM-as-judge calls per scan — the cost ceiling's other half. */
export const MAX_JUDGE_CALLS = 8;
/** Neighbour files judged per semantic rule when no mined population exists. */
export const JUDGE_FILES_PER_RULE = 5;
/** Lines of a judge candidate file kept around its most relevant region. */
export const JUDGE_FILE_LINES = 80;
/** Flat confidence cap for a rule verification could not resolve either way. */
export const UNVERIFIED_CONFIDENCE = 0.3;
/** Between S4b waves, stop dispatching new model calls past this scan age. */
export const SCAN_SOFT_BUDGET_MS = 100_000;
/** A scan still `queued`/`running` older than this on boot is orphaned (§S9). */
export const STALE_SCAN_MS = 15 * 60 * 1000;

/** Module-local default — cheap, NOT the FEATURE_MODELS registry default
 *  (which is gpt-5.4, real but expensive). Used via `featureModelOverride`,
 *  never `resolveFeatureModel`, so this default is preserved when unset. */
export const DEFAULT_MODEL = { provider: 'openai', model: 'gpt-4.1-mini' } as const;

// ---------------------------------------------------------------------------
// S3b miners — "could it be otherwise" thresholds
// ---------------------------------------------------------------------------

/** Minimum fan-in for an internal module to be considered a chokepoint (type A). */
export const CHOKEPOINT_MIN_FANIN = 3;
/** Minimum declared-endpoint population before a role contract (type B) is worth phrasing. */
export const MIN_ROLE_POPULATION = 3;
/** Minimum file count on BOTH sides of a directory pair before a zero-edge gap
 *  reads as an intentional layering boundary (type E) rather than "unrelated code". */
export const MIN_LAYERING_DIR_SIZE = 3;
/** Minimum repeat count before a placement pattern (type D) is a convention. */
export const MIN_PLACEMENT_REPEATS = 3;

// ---------------------------------------------------------------------------
// S5 reduce — rule-key normalization
// ---------------------------------------------------------------------------

/** Dropped when normalizing a rule to its dedupe key — connective filler that
 *  doesn't change the rule's identity ("Always use X" vs "Use X"). */
export const RULE_KEY_STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'always', 'never', 'should', 'must', 'use', 'uses', 'used',
  'instead', 'of', 'for', 'in', 'on', 'with', 'to', 'is', 'are', 'not', 'do', 'does',
]);

// ---------------------------------------------------------------------------
// buildSkillBody — merged skill layout
// ---------------------------------------------------------------------------

export const CATEGORY_ORDER: ConventionCategory[] = [
  'structure',
  'error_handling',
  'api',
  'imports',
  'typing',
  'naming',
  'testing',
  'logging',
  'formatting',
  'other',
];

export const CATEGORY_LABELS: Record<ConventionCategory, string> = {
  naming: 'Naming',
  error_handling: 'Error handling',
  structure: 'Structure',
  testing: 'Testing',
  imports: 'Imports',
  typing: 'Typing',
  logging: 'Logging',
  api: 'API',
  formatting: 'Formatting',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// config-rules.ts — deterministic parsers (decision 5: filtered by test 1)
// ---------------------------------------------------------------------------

/** ESLint rule ids whose violation a reviewer would have to catch by eye — the
 *  linter itself won't. Everything else (no-console, eqeqeq, camelcase, max-len,
 *  import/order, …) is lint-enforced noise and is dropped. */
export const ESLINT_RULES_WORTH_SURFACING: ReadonlySet<string> = new Set([
  'no-restricted-imports',
  'no-restricted-syntax',
  'import/no-default-export',
  '@typescript-eslint/no-floating-promises',
]);

/** Prettier keys — ALL of them fail test 1 (the formatter rewrites the file),
 *  so none are ever emitted as a candidate. Parsed only to suppress a model
 *  candidate that restates one of these. */
export const PRETTIER_KEYS: ReadonlySet<string> = new Set([
  'semi', 'singleQuote', 'printWidth', 'tabWidth', 'bracketSpacing', 'arrowParens', 'trailingComma',
]);

/** Phrase-level suppression: a model-authored candidate whose rule text is
 *  really just restating a Prettier concern, dropped in S5 regardless of
 *  whether a `.prettierrc` was found (decision 5 — formatting is pure token
 *  cost, whether or not the repo pins it explicitly). */
export const PRETTIER_RESTATEMENT_PATTERNS: RegExp[] = [
  /\bsemicolons?\b/i,
  /\bsingle[- ]?quotes?\b/i,
  /\bdouble[- ]?quotes?\b/i,
  /\bprint[- ]?width\b/i,
  /\bline[- ]?length\b/i,
  /\btab[- ]?width\b/i,
  /\bindentation\b/i,
  /\btrailing comma/i,
  /\barrow[- ]?paren/i,
  /\bbracket spacing/i,
];

/** tsconfig `compilerOptions` keys worth surfacing, and the rule text for each.
 *  `moduleResolution` and `paths` need custom phrasing (handled separately in
 *  config-rules.ts); everything else here is a flat boolean flag. */
export const TSCONFIG_FLAG_RULES: Record<string, string> = {
  strict: 'TypeScript strict mode is on — do not introduce implicit `any` or unchecked nulls.',
  noUncheckedIndexedAccess: 'Indexed access types include `undefined` — narrow before use.',
  exactOptionalPropertyTypes: 'Optional properties distinguish "missing" from "explicitly undefined" — do not assign `undefined` to an optional field.',
  verbatimModuleSyntax: 'Type-only imports/exports must use the `import type` / `export type` form.',
  noImplicitOverride: 'A method that overrides a base-class member must be marked `override`.',
};
