import type { SmartDiffRole } from '@devdigest/shared';
import {
  BARREL_MAX_CHANGED_LINES,
  BINARY_EXTENSIONS,
  CONFIG_BASENAMES,
  CONFIG_BASENAME_RE,
  CONFIG_EXTENSIONS,
  DOC_PATH_RE,
  DOC_ROLE,
  GENERATED_DIR_SEGMENTS,
  GENERATED_SUFFIXES,
  LOCKFILE_BASENAMES,
  TEST_PATH_RE,
  TEST_ROLE,
  WIRING_BASENAMES,
} from './constants.js';

/**
 * Smart Diff classifier — pure, no DB, no I/O.
 *
 * `classifyFile` takes the WHOLE file (not just the path) because one rule is
 * size-dependent: an entry-point basename is only `wiring` while the change is
 * small. Everything else is a pure path test.
 *
 * The path is lowercased and posix-normalised before matching. Callers upstream
 * already emit posix paths (`pipeline/walk.ts:120`); the guard here just makes
 * this function self-contained.
 */

export interface ClassifyInput {
  path: string;
  additions: number;
  deletions: number;
}

/** One classification rule. `match` returns true when this rule claims the file. */
export interface Rule {
  role: SmartDiffRole;
  match: (ctx: RuleContext) => boolean;
}

/** Everything a rule needs, derived once so each `match` stays cheap and pure. */
export interface RuleContext {
  /** Full posix, lowercased path. */
  path: string;
  /** Last path segment, lowercased. */
  basename: string;
  /** Path segments (posix `/`-split), lowercased. */
  segments: string[];
  additions: number;
  deletions: number;
}

function toContext(input: ClassifyInput): RuleContext {
  const path = input.path.replace(/\\/g, '/').toLowerCase();
  const segments = path.split('/').filter((s) => s.length > 0);
  const basename = segments[segments.length - 1] ?? path;
  return {
    path,
    basename,
    segments,
    additions: input.additions,
    deletions: input.deletions,
  };
}

/**
 * Ordered rule set — FIRST MATCH WINS. The ordering is load-bearing:
 *   1-4 (generated/binary) run before 5-6 (test/doc) so `__snapshots__/x.snap`
 *   stays boilerplate and never falls through to a test rule;
 *   8 (wiring basename) is size-gated and runs last before the `core` default.
 *
 * `core` is never matched — it is the default a file degrades to, so an unknown
 * extension errs toward "review it".
 *
 * Exported so a new rule is one array entry and the unit test can iterate it.
 */
export const RULES: readonly Rule[] = [
  // 1. lockfile basename → boilerplate
  { role: 'boilerplate', match: (c) => LOCKFILE_BASENAMES.includes(c.basename) },
  // 2. any generated directory segment → boilerplate (so `dist/index.js` is not wiring)
  {
    role: 'boilerplate',
    match: (c) => c.segments.some((seg) => GENERATED_DIR_SEGMENTS.includes(seg)),
  },
  // 3. generated filename suffix → boilerplate
  { role: 'boilerplate', match: (c) => GENERATED_SUFFIXES.some((sfx) => c.path.endsWith(sfx)) },
  // 4. binary extension → boilerplate
  { role: 'boilerplate', match: (c) => BINARY_EXTENSIONS.some((ext) => c.path.endsWith(ext)) },
  // 5. test path → wiring (after 1-4, so a snapshot stays boilerplate)
  { role: TEST_ROLE, match: (c) => TEST_PATH_RE.test(c.path) },
  // 6. doc path → wiring
  { role: DOC_ROLE, match: (c) => DOC_PATH_RE.test(c.path) },
  // 7. config basename / regex / extension → wiring
  {
    role: 'wiring',
    match: (c) =>
      CONFIG_BASENAMES.includes(c.basename) ||
      CONFIG_BASENAME_RE.test(c.basename) ||
      CONFIG_EXTENSIONS.some((ext) => c.path.endsWith(ext)),
  },
  // 8. entry-point basename AND a small change → wiring (size-gated)
  {
    role: 'wiring',
    match: (c) =>
      WIRING_BASENAMES.includes(c.basename) &&
      c.additions + c.deletions <= BARREL_MAX_CHANGED_LINES,
  },
];

/** Classify one file. First matching rule wins; unmatched files default to `core`. */
export function classifyFile(input: ClassifyInput): SmartDiffRole {
  const ctx = toContext(input);
  for (const rule of RULES) {
    if (rule.match(ctx)) return rule.role;
  }
  return 'core';
}
