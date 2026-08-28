import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

/** loadConfig is Zod-validated: valid/unset env → typed config; invalid → throw at startup. */
describe('loadConfig', () => {
  it('applies defaults when the relevant env vars are unset or empty', () => {
    const cfg = loadConfig({ MCP_RUN_MAX_WAIT_MS: '', DEVDIGEST_API_TOKEN: '  ' } as NodeJS.ProcessEnv);
    expect(cfg.apiUrl).toBe('http://localhost:3001');
    expect(cfg.apiToken).toBeUndefined();
    expect(cfg.runMaxWaitMs).toBe(90_000);
    expect(cfg.pollIntervalMs).toBe(3_000);
    expect(cfg.enableBlastRadius).toBe(false);
  });

  it('coerces valid overrides and strips a trailing slash from the URL', () => {
    const cfg = loadConfig({
      DEVDIGEST_API_URL: 'http://localhost:3011/',
      MCP_RUN_MAX_WAIT_MS: '5000',
      MCP_POLL_INTERVAL_MS: '250',
      MCP_ENABLE_BLAST_RADIUS: 'yes',
      DEVDIGEST_API_TOKEN: 'secret',
    } as NodeJS.ProcessEnv);
    expect(cfg.apiUrl).toBe('http://localhost:3011');
    expect(cfg.runMaxWaitMs).toBe(5000);
    expect(cfg.pollIntervalMs).toBe(250);
    expect(cfg.enableBlastRadius).toBe(true);
    expect(cfg.apiToken).toBe('secret');
  });

  it('THROWS on a non-numeric timeout, naming the offending variable', () => {
    expect(() => loadConfig({ MCP_RUN_MAX_WAIT_MS: 'soon' } as NodeJS.ProcessEnv)).toThrow(
      /MCP_RUN_MAX_WAIT_MS/,
    );
  });

  it('THROWS on a non-positive poll interval', () => {
    expect(() => loadConfig({ MCP_POLL_INTERVAL_MS: '-3' } as NodeJS.ProcessEnv)).toThrow(
      /MCP_POLL_INTERVAL_MS/,
    );
  });

  it('THROWS on a malformed API URL', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'localhost-no-scheme' } as NodeJS.ProcessEnv)).toThrow(
      /DEVDIGEST_API_URL/,
    );
  });
});
