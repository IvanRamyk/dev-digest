/** Constants for the settings module. */
import {
  FEATURE_MODELS,
  type ConnTestProvider,
  type FeatureModelChoice,
  type FeatureModelId,
  type SecretKey,
} from '@devdigest/shared';

/** Provider id used by the GitHub connection test branch. */
export const GITHUB_PROVIDER = 'github';

/** Maps a connection-test provider to the SecretsProvider key it persists to. */
export const SECRET_KEY_BY_PROVIDER: Record<ConnTestProvider, SecretKey> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  github: 'GITHUB_TOKEN',
};

/**
 * Per-feature model fallbacks, flattened from the shared registry. Each entry
 * mirrors the module constant the feature used before Settings could override
 * it, so an un-chosen feature behaves exactly as it did.
 */
export const FEATURE_MODEL_DEFAULTS = Object.fromEntries(
  FEATURE_MODELS.map((f) => [f.id, { provider: f.defaultProvider, model: f.defaultModel }]),
) as Record<FeatureModelId, FeatureModelChoice>;
