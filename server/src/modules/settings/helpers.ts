import { FeatureModelChoice, type FeatureModelId, type Settings } from '@devdigest/shared';
import type { SettingsRow } from './repository.js';
import { FEATURE_MODEL_DEFAULTS } from './constants.js';

/**
 * F1 — settings pure transforms. No DB and no I/O: every function here folds
 * over rows or values the repository already fetched, so the settings shape
 * rules unit-test without Postgres.
 */

/** Collapse key/value setting rows into a flat `Settings` object. */
export function rowsToSettings(rows: SettingsRow[]): Settings {
  const out: Record<string, unknown> = {};
  for (const r of rows) out[r.key] = r.value;
  return out as Settings;
}

/** The registry default (provider+model) for a feature — no DB read. */
export function defaultFeatureModel(id: FeatureModelId): FeatureModelChoice {
  return FEATURE_MODEL_DEFAULTS[id];
}

/**
 * The workspace's stored choice for `id`, or `undefined` when unset/invalid.
 * `settings.feature_models` came out of an untyped `jsonb` column, so the value
 * is parsed here — this is the decode boundary for untrusted DB JSON, not a
 * re-parse of something Fastify already validated.
 */
export function pickFeatureModel(
  settings: Settings,
  id: FeatureModelId,
): FeatureModelChoice | undefined {
  const chosen = (settings as { feature_models?: Record<string, unknown> }).feature_models;
  const parsed = FeatureModelChoice.safeParse(chosen?.[id]);
  return parsed.success ? parsed.data : undefined;
}
