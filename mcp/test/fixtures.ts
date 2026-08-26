/**
 * Test fixtures — a hand-built fake ApiClient plus sample rows. The fake lets
 * every unit test drive the tools without a network, and its methods can be
 * overridden per-case with vi.fn.
 */
import { vi } from 'vitest';
import type { ApiClient, ReviewRecordDto, ReviewFindingDto } from '../src/api/client.js';
import type { McpConfig } from '../src/config.js';

export const testConfig: McpConfig = {
  apiUrl: 'http://localhost:3001',
  apiToken: undefined,
  runMaxWaitMs: 90_000,
  pollIntervalMs: 3_000,
  enableBlastRadius: false,
};

export function makeAgent(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'agent-1',
    name: 'Reviewer',
    description: 'A reviewer',
    provider: 'openrouter',
    model: 'deepseek/deepseek-chat',
    system_prompt: 'x',
    output_schema: null,
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    ...over,
  };
}

export function makeRepo(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'repo-1',
    workspace_id: 'ws-1',
    owner: 'acme',
    name: 'widget',
    full_name: 'acme/widget',
    default_branch: 'main',
    clone_path: null,
    last_polled_at: null,
    created_by: null,
    ...over,
  };
}

export function makePr(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'pull-1',
    number: 7,
    title: 'Add thing',
    author: 'dev',
    branch: 'feat',
    base: 'main',
    head_sha: 'abc',
    additions: 10,
    deletions: 2,
    files_count: 3,
    status: 'open',
    ...over,
  };
}

export function makeFinding(over: Partial<ReviewFindingDto> = {}): ReviewFindingDto {
  return {
    id: 'f-1',
    severity: 'WARNING',
    category: 'bug',
    title: 'Possible null deref',
    file: 'src/a.ts',
    start_line: 12,
    end_line: 12,
    rationale: 'because',
    suggestion: 'guard it',
    confidence: 0.8,
    kind: 'finding',
    review_id: 'rev-1',
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

export function makeReview(over: Partial<ReviewRecordDto> = {}): ReviewRecordDto {
  return {
    id: 'rev-1',
    pr_id: 'pull-1',
    agent_id: 'agent-1',
    run_id: 'run-1',
    agent_name: 'Reviewer',
    kind: 'review',
    verdict: 'comment',
    summary: 'ok',
    score: 78,
    model: 'deepseek/deepseek-chat',
    grounding: null,
    created_at: '2026-08-23T00:00:00.000Z',
    findings: [makeFinding()],
    ...over,
  };
}

export function makeRun(over: Partial<Record<string, unknown>> = {}) {
  return {
    run_id: 'run-1',
    agent_id: 'agent-1',
    agent_name: 'Reviewer',
    provider: 'openrouter',
    model: 'deepseek/deepseek-chat',
    status: 'done',
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.01,
    findings_count: 1,
    grounding: null,
    ran_at: '2026-08-23T00:00:00.000Z',
    score: 78,
    blockers: 0,
    ...over,
  };
}

/**
 * Build a fake ApiClient with vi.fn methods. Every method rejects by default so
 * a test that forgets to stub one fails loudly rather than silently.
 */
export function fakeClient(): {
  [K in keyof ApiClient]: ReturnType<typeof vi.fn>;
} & ApiClient {
  const client = {
    getAgents: vi.fn(),
    getRepos: vi.fn(),
    addRepo: vi.fn(),
    getPulls: vi.fn(),
    startReview: vi.fn(),
    getRuns: vi.fn(),
    getReviews: vi.fn(),
    getBlastRadius: vi.fn(),
    getConventions: vi.fn(),
  };
  return client as unknown as {
    [K in keyof ApiClient]: ReturnType<typeof vi.fn>;
  } & ApiClient;
}

/** A tool result's content is a union; we only ever emit/read text blocks here. */
type AnyContent = { type: string; text?: string };
interface AnyToolResult {
  content: AnyContent[];
  isError?: boolean;
}

/** Parse a tool's single text content block back into an object. */
export function parseResult(result: AnyToolResult) {
  const block = result.content.find((c) => c.type === 'text');
  return block?.text ? JSON.parse(block.text) : undefined;
}

/** Get the raw text of a tool result (for error-forward assertions). */
export function resultText(result: AnyToolResult): string {
  return result.content.map((c) => c.text ?? '').join('\n');
}
