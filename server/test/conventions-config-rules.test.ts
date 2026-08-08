import { describe, it, expect } from 'vitest';
import {
  parseEslintConfig,
  parsePrettierConfig,
  parseTsconfig,
  parsePackageJson,
} from '../src/modules/conventions/config-rules.js';

describe('parseEslintConfig', () => {
  it('emits only the whitelisted rule ids at error severity', () => {
    const raw = JSON.stringify({
      rules: {
        'no-restricted-imports': 'error',
        'no-console': 'error', // lint-enforced noise — dropped
        eqeqeq: 2, // lint-enforced noise — dropped
        '@typescript-eslint/no-floating-promises': 'error',
      },
    });
    const out = parseEslintConfig(raw, '.eslintrc.json');
    expect(out.map((r) => r.category).sort()).toEqual(['error_handling', 'imports']);
  });

  it('skips a whitelisted rule id at warn severity', () => {
    const raw = JSON.stringify({ rules: { 'no-restricted-imports': 'warn' } });
    expect(parseEslintConfig(raw, '.eslintrc.json')).toEqual([]);
  });

  it('unknown rule ids are skipped, never turned into "obey rule X"', () => {
    const raw = JSON.stringify({ rules: { 'some-unknown-plugin/some-rule': 'error' } });
    expect(parseEslintConfig(raw, '.eslintrc.json')).toEqual([]);
  });

  it('no-restricted-syntax uses the rule message verbatim when present', () => {
    const raw = JSON.stringify({
      rules: {
        'no-restricted-syntax': ['error', { selector: 'ForInStatement', message: 'Use Object.entries instead of for-in.' }],
      },
    });
    const out = parseEslintConfig(raw, '.eslintrc.json');
    expect(out).toHaveLength(1);
    expect(out[0]!.rule).toBe('Use Object.entries instead of for-in.');
  });

  it('emits a meta-rule when extends is non-empty', () => {
    const raw = JSON.stringify({ extends: ['eslint:recommended'] });
    const out = parseEslintConfig(raw, '.eslintrc.json');
    expect(out).toHaveLength(1);
    expect(out[0]!.rule).toContain('eslint:recommended');
  });

  it('malformed JSON yields []', () => {
    expect(parseEslintConfig('{ not json', '.eslintrc.json')).toEqual([]);
  });
});

describe('parsePrettierConfig', () => {
  it('every Prettier key yields zero rules', () => {
    const raw = JSON.stringify({
      semi: false,
      singleQuote: true,
      printWidth: 100,
      tabWidth: 2,
      trailingComma: 'all',
      arrowParens: 'always',
      bracketSpacing: true,
    });
    expect(parsePrettierConfig(raw, '.prettierrc')).toEqual([]);
  });

  it('malformed input still yields []', () => {
    expect(parsePrettierConfig('not json at all', '.prettierrc')).toEqual([]);
  });
});

describe('parseTsconfig', () => {
  it('parses JSONC (comments + trailing commas)', () => {
    const raw = `{
      // strict mode
      "compilerOptions": {
        "strict": true, /* block comment */
        "moduleResolution": "NodeNext",
      },
    }`;
    const out = parseTsconfig(raw, 'tsconfig.json');
    expect(out.some((r) => r.rule.includes('strict mode'))).toBe(true);
    expect(out.some((r) => r.rule.includes('.js` extension'))).toBe(true);
  });

  it('flags a non-empty paths map', () => {
    const raw = JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } });
    const out = parseTsconfig(raw, 'tsconfig.json');
    expect(out.some((r) => r.rule.includes('paths'))).toBe(true);
  });

  it('an empty paths map emits nothing', () => {
    const raw = JSON.stringify({ compilerOptions: { paths: {} } });
    const out = parseTsconfig(raw, 'tsconfig.json');
    expect(out.some((r) => r.rule.includes('paths'))).toBe(false);
  });

  it('malformed JSON yields []', () => {
    expect(parseTsconfig('{{{', 'tsconfig.json')).toEqual([]);
  });
});

describe('parsePackageJson', () => {
  it('flags "type": "module" and a pinned packageManager', () => {
    const raw = JSON.stringify({ type: 'module', packageManager: 'pnpm@10.0.0' });
    const out = parsePackageJson(raw, 'package.json');
    expect(out).toHaveLength(2);
  });

  it('malformed JSON yields []', () => {
    expect(parsePackageJson('not json', 'package.json')).toEqual([]);
  });
});
