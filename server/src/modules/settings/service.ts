import type {
  ConnTestRequest,
  ConnTestResult,
  FeatureModelChoice,
  FeatureModelId,
  SecretsStatus,
  Settings,
  SettingsUpdate,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { SettingsRepository } from './repository.js';
import { defaultFeatureModel, pickFeatureModel, rowsToSettings } from './helpers.js';
import { GITHUB_PROVIDER, SECRET_KEY_BY_PROVIDER } from './constants.js';

/**
 * F1 — settings service. Business logic for the Settings feature:
 *   - read / upsert the workspace's non-secret prefs
 *   - report which provider keys are configured (booleans only)
 *   - test a provider key with a cheap live call (listModels / GET user)
 *   - resolve per-feature model choices (workspace override → registry default)
 *
 * No HTTP and no raw SQL live here — persistence goes through
 * SettingsRepository, pure transforms through helpers.ts, literals through
 * constants.ts. Secret VALUES never leave this class: they are written through
 * `container.secrets` and read only to hand straight to an adapter.
 */
export class SettingsService {
  private repo: SettingsRepository;

  constructor(private container: Container) {
    this.repo = new SettingsRepository(container.db);
  }

  /** Current non-secret prefs for the workspace, as a flat object. */
  async get(workspaceId: string): Promise<Settings> {
    return rowsToSettings(await this.repo.listForWorkspace(workspaceId));
  }

  /**
   * Upsert each supplied pref, then return the full post-write settings object
   * (the client renders the response, so it must include untouched keys too).
   */
  async update(workspaceId: string, userId: string, patch: SettingsUpdate): Promise<Settings> {
    for (const [key, value] of Object.entries(patch)) {
      await this.repo.upsert(workspaceId, userId, key, value);
    }
    return this.get(workspaceId);
  }

  /**
   * Which provider keys are configured — booleans ONLY, the values are never
   * returned. Drives the "Configured / Not set" badges in the API Keys panel.
   */
  async secretsStatus(): Promise<SecretsStatus> {
    const entries = await Promise.all(
      (Object.entries(SECRET_KEY_BY_PROVIDER) as [keyof SecretsStatus, string][]).map(
        async ([provider, key]) =>
          [provider, Boolean(await this.container.secrets.get(key))] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  }

  /**
   * Test a provider key. A failure is a RESULT, not an exception — the panel
   * renders the message inline, so every error path returns `ok: false`.
   */
  async testConnection({ provider, key }: ConnTestRequest): Promise<ConnTestResult> {
    try {
      // If the UI supplied a key, persist it (BYO key) before testing so the
      // test reflects — and the rest of the app can use — the new value.
      if (key) {
        if (!this.container.secrets.set) {
          return { provider, ok: false, message: 'Secrets backend is read-only' };
        }
        await this.container.secrets.set(SECRET_KEY_BY_PROVIDER[provider], key);
        this.container.invalidateSecretCaches();
      }
      if (provider === GITHUB_PROVIDER) {
        const gh = await this.container.github();
        const login = await gh.currentLogin();
        return { provider, ok: true, message: `Connected as @${login}` };
      }
      const llm = await this.container.llm(provider);
      const models = await llm.listModels();
      return { provider, ok: true, message: `OK — ${models.length} models available` };
    } catch (err) {
      return { provider, ok: false, message: (err as Error).message };
    }
  }

  /**
   * The workspace's override for `id`, or `undefined` when unset/invalid.
   * Callers that keep their own dynamic default (e.g. conventions) use this
   * directly so that default is preserved; callers with a static default use
   * `resolveFeatureModel` instead.
   */
  async featureModelOverride(
    workspaceId: string,
    id: FeatureModelId,
  ): Promise<FeatureModelChoice | undefined> {
    return pickFeatureModel(await this.get(workspaceId), id);
  }

  /** Resolve `id` to a concrete provider+model: workspace override, else registry default. */
  async resolveFeatureModel(workspaceId: string, id: FeatureModelId): Promise<FeatureModelChoice> {
    return (await this.featureModelOverride(workspaceId, id)) ?? defaultFeatureModel(id);
  }
}
