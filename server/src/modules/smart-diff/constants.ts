import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff — every literal, nothing imported but the role type.
 *
 * DELIBERATELY NOT `EXCLUDED_DIRS` from `modules/repo-intel/constants.ts`.
 * Same names, different question: repo-intel asks "what should I index" (and
 * bumps `INDEXER_VERSION` when that answer changes); Smart Diff asks "what can a
 * reviewer safely skip". Coupling the two would entangle reviewer-facing
 * classification with indexer-version churn.
 */

/** Group render order, worst-to-review first. Also the fold's iteration order. */
export const ROLE_ORDER: readonly SmartDiffRole[] = ['core', 'wiring', 'boilerplate'];

/** Tests and docs both land in `wiring` — named constants so the intent is legible. */
export const TEST_ROLE: SmartDiffRole = 'wiring';
export const DOC_ROLE: SmartDiffRole = 'wiring';

/** Dependency lockfiles — pure machine output, never reviewed by hand. */
export const LOCKFILE_BASENAMES: readonly string[] = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'cargo.lock',
  'poetry.lock',
  'gemfile.lock',
  'composer.lock',
  'go.sum',
];

/** Any path segment matching one of these marks the file generated → boilerplate. */
export const GENERATED_DIR_SEGMENTS: readonly string[] = [
  'dist',
  'build',
  'out',
  '.next',
  'coverage',
  'node_modules',
  'vendor',
  'target',
  '__generated__',
  'generated',
  '__snapshots__',
];

/** Filename suffixes produced by a tool, never authored. */
export const GENERATED_SUFFIXES: readonly string[] = [
  '.snap',
  '.min.js',
  '.min.css',
  '.map',
  '.d.ts',
  '.generated.ts',
  '.pb.go',
  '_pb2.py',
  // Drizzle migration metadata — regenerated wholesale by `db:generate`, never
  // reviewed line-by-line (a 0013_snapshot.json is thousands of generated lines).
  '_snapshot.json',
  '_journal.json',
];

/** Non-text assets: nothing to line-review. */
export const BINARY_EXTENSIONS: readonly string[] = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.pdf',
  '.zip',
  '.lockb',
];

/** Project-config filenames → wiring. */
export const CONFIG_BASENAMES: readonly string[] = [
  'package.json',
  'tsconfig.json',
  'dockerfile',
  'makefile',
  'docker-compose.yml',
  'docker-compose.yaml',
  '.gitignore',
  '.dockerignore',
  '.npmrc',
  '.nvmrc',
  '.editorconfig',
];

/** Tool-config filenames like `vitest.config.ts`, `tailwind.config.js` → wiring. */
export const CONFIG_BASENAME_RE =
  /^(tsconfig|jest|vitest|vite|next|tailwind|postcss|drizzle|eslint|babel|rollup|webpack)\./;

/** Config-shaped extensions → wiring. */
export const CONFIG_EXTENSIONS: readonly string[] = ['.yml', '.yaml', '.toml', '.ini', '.env'];

/** Generated migration SQL (the actual DDL) → wiring: visible infra worth a
    glance, but not top-of-review `core`. The `_snapshot.json`/`_journal.json`
    metadata beside it is caught earlier as boilerplate. */
export const MIGRATION_SQL_RE = /(^|\/)migrations\/.*\.sql$/;

/**
 * Entry-point / wiring basenames. Only classify as `wiring` when the change is
 * SMALL (see `BARREL_MAX_CHANGED_LINES`): a 300-line rewrite of `app.ts` is the
 * substance of the PR, not boilerplate.
 */
export const WIRING_BASENAMES: readonly string[] = [
  'index.ts',
  'index.tsx',
  'index.js',
  'index.jsx',
  'main.ts',
  'main.tsx',
  'main.js',
  'app.ts',
  'app.tsx',
  'app.js',
  'server.ts',
  'server.js',
  'routes.ts',
  'container.ts',
  'providers.tsx',
  'bootstrap.ts',
  'bootstrap.js',
  'di.ts',
];

/** Test paths: `*.test.*`, `*.spec.*`, or anything under a `__tests__`/`test`/`tests` dir. */
export const TEST_PATH_RE = /(^|\/)(__tests__|tests?)\/|\.(test|spec|it\.test)\.[a-z]+$/;

/** Doc paths: markdown, or anything under a `docs/` directory. */
export const DOC_PATH_RE = /(^|\/)docs?\/|\.(md|mdx)$/;

/** A wiring basename only stays `wiring` up to this much churn; past it, it's `core`. */
export const BARREL_MAX_CHANGED_LINES = 20;

/** A finding range wider than this contributes only its `start_line`. */
export const MAX_FINDING_LINE_SPAN = 50;

/** Split-suggestion thresholds. */
export const SPLIT_TOO_BIG_LINES = 400;
export const SPLIT_TOO_BIG_CORE_FILES = 8;
export const SPLIT_DIR_DEPTH = 2;
export const MIN_FILES_PER_SPLIT = 2;
export const MAX_PROPOSED_SPLITS = 4;

/** Split names — a directory prefix, or these two reserved buckets. */
export const BOILERPLATE_SPLIT_NAME = 'generated';
export const REMAINDER_SPLIT_NAME = 'rest';
