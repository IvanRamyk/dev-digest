import type { Container } from '../../platform/container.js';
import type { Skill, SkillType, SkillSource } from '@devdigest/shared';
import { wrapUntrusted } from '../../platform/prompt.js';
import { AppError } from '../../platform/errors.js';
import { SkillsRepository } from './repository.js';
import type { SkillVersionRow } from '../../db/rows.js';
import { toDto, extractSkillFromMarkdown, extractSkillFromArchive } from './helpers.js';
import type { SkillImportPreview } from './helpers.js';
import { unzipArchive } from './archive.js';

/**
 * A1 — skills service. CRUD, versioning, and import (markdown or zip). Business
 * logic only — no HTTP, no raw SQL (that's repository.ts).
 *
 * Imported content is UNTRUSTED: it is wrapped (`wrapUntrusted`) before storage
 * so prompt assembly always treats it as data, never instructions, and it lands
 * `enabled: false` — a vetting gate a stranger's upload cannot bypass.
 */

export interface CreateSkillInput {
  name: string;
  description?: string;
  type?: SkillType;
  source?: SkillSource;
  body: string;
  enabled?: boolean;
  evidenceFiles?: string[] | null;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

/** The public shape of a `skill_versions` row (no shared zod contract needed —
 *  the route validates params only, matching `modules/agents` precedent). */
export interface SkillVersionDto {
  skill_id: string;
  version: number;
  body: string;
  created_at: string;
}

function toVersionDto(row: SkillVersionRow): SkillVersionDto {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toDto(row) : undefined;
  }

  /** Delete a skill (and its versions/agent-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description ?? input.name,
      type: input.type ?? 'custom',
      source: input.source ?? 'manual',
      body: input.body,
      enabled: input.enabled ?? true,
      evidenceFiles: input.evidenceFiles ?? null,
    });
    return toDto(row);
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toDto(row) : undefined;
  }

  /** Config history for a skill, newest version first. Undefined = 404 (route maps it). */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersionDto[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toVersionDto);
  }

  /**
   * Restore a past version's body. Implemented as `update({ body })`, which
   * forward-bumps to a NEW version rather than rewinding the counter — history
   * stays append-only.
   */
  async restoreVersion(workspaceId: string, id: string, version: number): Promise<Skill | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const target = await this.repo.getVersion(id, version);
    if (!target) throw new AppError('version_not_found', `Version ${version} was never recorded`, 404);
    const row = await this.repo.update(workspaceId, id, { body: target.body });
    return row ? toDto(row) : undefined;
  }

  /** Preview an import from an uploaded `.md` or `.zip` — persists nothing. */
  async previewImport(filename: string, contentBase64: string): Promise<SkillImportPreview> {
    const buf = Buffer.from(contentBase64, 'base64');
    if (filename.toLowerCase().endsWith('.zip')) {
      const entries = unzipArchive(buf);
      const preview = extractSkillFromArchive(entries);
      if (!preview) throw new AppError('empty_skill_body', 'No markdown skill body found in archive', 400);
      return preview;
    }
    return extractSkillFromMarkdown(filename, buf.toString('utf8'));
  }

  /**
   * Persist a confirmed import preview. The body is wrapped as untrusted data
   * (never instructions) and the skill lands disabled regardless of what the
   * caller passes — vetting is mandatory for anything that arrived via upload.
   */
  async confirmImport(workspaceId: string, preview: SkillImportPreview): Promise<Skill> {
    const safeBody = wrapUntrusted(`imported:${preview.source}`, preview.body);
    return this.create(workspaceId, {
      name: preview.name,
      description: preview.description,
      type: preview.type,
      source: preview.source,
      body: safeBody,
      enabled: false,
    });
  }
}
