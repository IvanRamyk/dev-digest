import type { Skill, SkillType, SkillSource } from '@devdigest/shared';
import type { SkillRow } from '../../db/rows.js';
import { TYPE_PATTERNS, DEFAULT_SKILL_NAME, NAME_MAX_LEN } from './constants.js';

/**
 * A1 — skills pure helpers. No I/O.
 */

/** Map a persisted skill row to the `Skill` DTO. */
export function toDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/** Heuristic: derive a skill type from its name/body for imported content. */
export function inferType(name: string, body: string): SkillType {
  const hay = `${name}\n${body}`.toLowerCase();
  if (TYPE_PATTERNS.security.test(hay)) return 'security';
  if (TYPE_PATTERNS.convention.test(hay)) return 'convention';
  if (TYPE_PATTERNS.rubric.test(hay)) return 'rubric';
  return 'custom';
}

/** First non-empty line (heading markers stripped), capped, else fallback. */
export function firstLine(body: string, fallback: string): string {
  const line = body
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .find((l) => l.length > 0);
  return (line ?? fallback).slice(0, NAME_MAX_LEN);
}

/** Derive a fallback skill name from an uploaded filename (extension stripped). */
export function nameFromFilename(filename: string): string {
  const base = filename.split('/').pop() ?? DEFAULT_SKILL_NAME;
  const stripped = base.replace(/\.[^.]+$/, '').trim();
  return stripped.length > 0 ? stripped : DEFAULT_SKILL_NAME;
}

/** A single archive entry that was not used as the skill body. */
export interface SkippedEntry {
  path: string;
  bytes: number;
  reason: 'not_processed' | 'unsafe_path';
}

/** Result of extracting a candidate skill from an uploaded `.md` or `.zip`. */
export interface SkillImportPreview {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source: SkillSource;
  skipped: SkippedEntry[];
}

/** Rejects zip-slip-shaped paths: `..` segments, a leading `/`, backslashes, or `:`. */
export function isUnsafeArchivePath(path: string): boolean {
  return (
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes(':') ||
    path.split('/').some((seg) => seg === '..')
  );
}

/** Extract a skill preview from a single uploaded markdown file. Pure — no wrapping. */
export function extractSkillFromMarkdown(filename: string, raw: string): SkillImportPreview {
  const trimmed = raw.trim();
  const name = firstLine(trimmed, nameFromFilename(filename));
  return {
    name,
    description: firstLine(trimmed, name),
    type: inferType(name, trimmed),
    body: trimmed,
    source: 'extracted',
    skipped: [],
  };
}

/**
 * Extract a skill preview from an unzipped archive's entries.
 *
 * Body selection: `SKILL.md` (any depth, case-insensitive) wins; else the
 * shallowest `*.md` entry; else throws (caller maps to `empty_skill_body`).
 * Every other entry — including markdown entries not selected — comes back in
 * `skipped` with reason `'not_processed'`. Entries with an unsafe path (zip-slip
 * shape) are excluded from body selection and reported with reason `'unsafe_path'`
 * even though nothing is ever written to disk.
 */
export function extractSkillFromArchive(
  entries: Record<string, Uint8Array>,
): SkillImportPreview | undefined {
  const skipped: SkippedEntry[] = [];
  const safe: Array<{ path: string; bytes: Uint8Array }> = [];

  for (const [path, bytes] of Object.entries(entries)) {
    if (path.endsWith('/')) continue; // directory entry
    if (isUnsafeArchivePath(path)) {
      skipped.push({ path, bytes: bytes.length, reason: 'unsafe_path' });
      continue;
    }
    safe.push({ path, bytes });
  }

  const depthOf = (path: string) => path.split('/').length;
  const mdEntries = safe.filter((e) => e.path.toLowerCase().endsWith('.md'));
  const skillMd = mdEntries
    .filter((e) => (e.path.split('/').pop() ?? '').toLowerCase() === 'skill.md')
    .sort((a, b) => depthOf(a.path) - depthOf(b.path))[0];
  const shallowestMd = mdEntries.slice().sort((a, b) => depthOf(a.path) - depthOf(b.path))[0];
  const chosen = skillMd ?? shallowestMd;

  if (!chosen) {
    for (const e of safe) skipped.push({ path: e.path, bytes: e.bytes.length, reason: 'not_processed' });
    return undefined;
  }

  for (const e of safe) {
    if (e.path !== chosen.path) skipped.push({ path: e.path, bytes: e.bytes.length, reason: 'not_processed' });
  }

  const preview = extractSkillFromMarkdown(chosen.path, Buffer.from(chosen.bytes).toString('utf8'));
  return { ...preview, skipped };
}
