import type { ConventionCategory } from '@devdigest/shared';
import { ESLINT_RULES_WORTH_SURFACING, TSCONFIG_FLAG_RULES } from './constants.js';
import { stripJsonComments } from './helpers.js';
import type { RawCandidate } from './types.js';

/**
 * Deterministic config-derived candidates — no model, never throw (malformed
 * input → `[]`). Filtered by test 1 (decision 5): a rule is emitted only if
 * breaking it survives the linter/formatter, so a reviewer would actually
 * have to catch it by eye.
 */

export interface ConfigRule {
  rule: string;
  category: ConventionCategory;
  evidencePath: string;
  evidenceLine: number;
}

function firstLineContaining(raw: string, needle: string): number {
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes(needle)) return i + 1;
  }
  return 1;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * ESLint config (`.eslintrc.json` or `package.json#eslintConfig`). Emits only
 * `ESLINT_RULES_WORTH_SURFACING` at severity error/2 — rules whose violation
 * a reviewer has to catch by eye, because eslint itself won't (`no-console`,
 * `eqeqeq`, `camelcase`, `max-len`, `import/order`, … are dropped as
 * lint-enforced noise). Unknown rule ids are skipped, never turned into
 * "obey rule X". Flat `eslint.config.{js,mjs,ts}` / `.eslintrc.js` are
 * JavaScript and unparseable statically — this yields zero rules for them,
 * which is an accepted gap (this is a booster, not the feature).
 */
export function parseEslintConfig(raw: string, path: string): ConfigRule[] {
  const json = safeJsonParse(raw) as
    | { rules?: Record<string, unknown>; extends?: unknown }
    | undefined;
  if (!json || typeof json !== 'object') return [];
  const out: ConfigRule[] = [];

  const rules = json.rules ?? {};
  for (const [id, entry] of Object.entries(rules)) {
    if (!ESLINT_RULES_WORTH_SURFACING.has(id)) continue;
    const severity = Array.isArray(entry) ? entry[0] : entry;
    if (severity !== 'error' && severity !== 2) continue;
    const options = Array.isArray(entry) ? entry.slice(1) : [];
    const line = firstLineContaining(raw, `"${id}"`);

    if (id === 'no-restricted-imports') {
      out.push({
        rule: `Do not import the paths restricted by ESLint's \`no-restricted-imports\` (see \`${path}\`).`,
        category: 'imports',
        evidencePath: path,
        evidenceLine: line,
      });
    } else if (id === 'no-restricted-syntax') {
      const withMessage = options.find(
        (o): o is { message?: unknown } => typeof o === 'object' && o !== null && 'message' in o,
      );
      if (typeof withMessage?.message === 'string' && withMessage.message.length > 0) {
        out.push({ rule: withMessage.message, category: 'structure', evidencePath: path, evidenceLine: line });
      }
    } else if (id === 'import/no-default-export') {
      out.push({
        rule: 'Do not use a default export — named exports only.',
        category: 'imports',
        evidencePath: path,
        evidenceLine: line,
      });
    } else if (id === '@typescript-eslint/no-floating-promises') {
      out.push({
        rule: 'Every promise is awaited, returned, or explicitly voided — none are left floating.',
        category: 'error_handling',
        evidencePath: path,
        evidenceLine: line,
      });
    }
  }

  const extendsList = Array.isArray(json.extends)
    ? json.extends
    : typeof json.extends === 'string'
      ? [json.extends]
      : [];
  if (extendsList.length > 0) {
    out.push({
      rule: `Lint config extends ${extendsList.map((e) => `\`${e}\``).join(', ')} — new code should follow those presets' conventions, not just the local overrides.`,
      category: 'other',
      evidencePath: path,
      evidenceLine: firstLineContaining(raw, 'extends'),
    });
  }

  return out;
}

/**
 * Prettier config (`.prettierrc*` / `package.json#prettier`) — ALWAYS `[]`.
 * Every key it can carry (`semi`, `singleQuote`, `printWidth`, `tabWidth`,
 * `trailingComma`, `arrowParens`, `bracketSpacing`) is auto-rewritten by the
 * formatter, so all of them fail test 1. Parsed (not skipped outright) so the
 * empty result is asserted explicitly, not just assumed.
 */
export function parsePrettierConfig(_raw: string, _path: string): ConfigRule[] {
  return [];
}

/**
 * tsconfig.json (JSONC — comments + trailing commas allowed). Flag rules from
 * `TSCONFIG_FLAG_RULES`, plus two rules that need custom phrasing:
 * `moduleResolution: NodeNext` → explicit `.js` extensions, and a non-empty
 * `paths` map → cross-package imports use the aliases.
 */
export function parseTsconfig(raw: string, path: string): ConfigRule[] {
  const stripped = stripJsonComments(raw);
  const json = safeJsonParse(stripped) as { compilerOptions?: Record<string, unknown> } | undefined;
  const opts = json?.compilerOptions;
  if (!opts || typeof opts !== 'object') return [];
  const out: ConfigRule[] = [];

  for (const [key, ruleText] of Object.entries(TSCONFIG_FLAG_RULES)) {
    if (opts[key] === true) {
      out.push({
        rule: ruleText,
        category: 'typing',
        evidencePath: path,
        evidenceLine: firstLineContaining(raw, `"${key}"`),
      });
    }
  }

  const moduleResolution = opts.moduleResolution;
  if (typeof moduleResolution === 'string' && /^nodenext$/i.test(moduleResolution)) {
    out.push({
      rule: 'Relative imports carry an explicit `.js` extension (moduleResolution: NodeNext).',
      category: 'imports',
      evidencePath: path,
      evidenceLine: firstLineContaining(raw, 'moduleResolution'),
    });
  }

  const paths = opts.paths;
  if (paths && typeof paths === 'object' && Object.keys(paths).length > 0) {
    out.push({
      rule: 'Cross-package imports use the tsconfig `paths` aliases, not a relative path that reaches into another package.',
      category: 'imports',
      evidencePath: path,
      evidenceLine: firstLineContaining(raw, '"paths"'),
    });
  }

  return out;
}

/** package.json — `"type": "module"` and a pinned `packageManager`. */
export function parsePackageJson(raw: string, path: string): ConfigRule[] {
  const json = safeJsonParse(raw) as { type?: string; packageManager?: string } | undefined;
  if (!json || typeof json !== 'object') return [];
  const out: ConfigRule[] = [];
  if (json.type === 'module') {
    out.push({
      rule: 'Package is ESM (`"type": "module"`) — no `require()`, no CommonJS interop assumptions.',
      category: 'imports',
      evidencePath: path,
      evidenceLine: firstLineContaining(raw, '"type"'),
    });
  }
  if (json.packageManager) {
    out.push({
      rule: `Package manager is pinned to \`${json.packageManager}\` — do not install with a different one.`,
      category: 'other',
      evidencePath: path,
      evidenceLine: firstLineContaining(raw, '"packageManager"'),
    });
  }
  return out;
}

/** Lift a `ConfigRule` into a pipeline `RawCandidate`: `source: 'config'`,
 *  pre-verified, confidence 1.0 — bypasses S6 verification entirely. */
export function toRawCandidate(rule: ConfigRule): RawCandidate {
  return {
    rule: rule.rule,
    category: rule.category,
    evidence: { path: rule.evidencePath, startLine: rule.evidenceLine, endLine: rule.evidenceLine, snippet: '' },
    source: 'config',
    rank: 0,
    preVerified: { verification: 'config', supportCount: 0, violationCount: 0 },
  };
}
