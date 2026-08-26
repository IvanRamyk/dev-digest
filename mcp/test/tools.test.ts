import { describe, it, expect, beforeEach } from 'vitest';
import { listAgentsHandler } from '../src/tools/list-agents.js';
import { getConventionsHandler } from '../src/tools/get-conventions.js';
import { getFindingsHandler } from '../src/tools/get-findings.js';
import { runAgentOnPrHandler } from '../src/tools/run-agent-on-pr.js';
import { blastRadiusHandler } from '../src/tools/get-blast-radius.js';
import { shapeFindings, FINDINGS_CAP } from '../src/tools/_shared.js';
import { _resetRunMap, rememberRun } from '../src/api/resolve.js';
import { ApiUnreachableError } from '../src/api/errors.js';
import {
  fakeClient,
  makeAgent,
  makeFinding,
  makePr,
  makeRepo,
  makeReview,
  makeRun,
  parseResult,
  resultText,
  testConfig,
} from './fixtures.js';

beforeEach(() => _resetRunMap());

// A fast config so poll loops in run_agent_on_pr resolve instantly.
const fastConfig = { ...testConfig, pollIntervalMs: 1, runMaxWaitMs: 50 };

describe('_shared.shapeFindings', () => {
  it('orders by severity, filters, and caps with a note', () => {
    const findings = [
      makeFinding({ severity: 'SUGGESTION', title: 's' }),
      makeFinding({ severity: 'CRITICAL', title: 'c' }),
      makeFinding({ severity: 'WARNING', title: 'w' }),
    ];
    const shaped = shapeFindings(findings, { format: 'concise' });
    expect(shaped.items.map((f) => f.severity)).toEqual(['CRITICAL', 'WARNING', 'SUGGESTION']);
    expect(shaped.truncated_note).toBeUndefined();

    const filtered = shapeFindings(findings, { format: 'concise', severity: 'WARNING' });
    expect(filtered.items.map((f) => f.severity)).toEqual(['CRITICAL', 'WARNING']);
  });

  it('renders a multi-line span and detailed fields', () => {
    const [concise] = shapeFindings([makeFinding({ start_line: 5, end_line: 9 })], {
      format: 'concise',
    }).items;
    expect(concise!.line).toBe('5-9');
    const [detailed] = shapeFindings([makeFinding()], { format: 'detailed' }).items;
    expect(detailed).toHaveProperty('rationale');
    expect(detailed).toHaveProperty('category');
  });

  it('caps at FINDINGS_CAP and reports how many were dropped', () => {
    const many = Array.from({ length: FINDINGS_CAP + 5 }, (_, i) =>
      makeFinding({ id: `f${i}`, severity: 'WARNING' }),
    );
    const shaped = shapeFindings(many, { format: 'concise' });
    expect(shaped.items).toHaveLength(FINDINGS_CAP);
    expect(shaped.truncated_note).toContain(String(FINDINGS_CAP + 5));
  });
});

describe('devdigest_list_agents', () => {
  it('returns the seeded agents as a compact projection', async () => {
    const client = fakeClient();
    client.getAgents.mockResolvedValue([makeAgent({ name: 'Sec', provider: 'openai' })]);
    const out = parseResult(await listAgentsHandler(client)());
    expect(out.agents).toEqual([
      { name: 'Sec', description: 'A reviewer', provider: 'openai', model: 'deepseek/deepseek-chat', enabled: true },
    ]);
  });

  it('renders the "start ./scripts/dev.sh" hint when the API is down', async () => {
    const client = fakeClient();
    client.getAgents.mockRejectedValue(new ApiUnreachableError('http://localhost:3001'));
    const res = await listAgentsHandler(client)();
    expect(res.isError).toBe(true);
    expect(resultText(res)).toContain('./scripts/dev.sh');
  });
});

describe('devdigest_get_conventions', () => {
  it('reads accepted conventions and wraps them untrusted', async () => {
    const client = fakeClient();
    client.getRepos.mockResolvedValue([makeRepo()]);
    client.getConventions.mockResolvedValue({
      scan: { status: 'done' },
      candidates: [
        { rule: 'no console.log', category: 'style', status: 'accepted', evidence_path: 'a.ts', confidence: 0.9 },
      ],
    });
    const out = parseResult(await getConventionsHandler(client)({ repo: 'acme/widget' }));
    expect(client.getConventions).toHaveBeenCalledWith('repo-1', 'accepted');
    expect(out.scan_status).toBe('done');
    expect(out.conventions).toContain('<untrusted_content source="repo_conventions">');
    expect(out.conventions).toContain('no console.log');
  });

  it('never-scanned repo returns the run-a-scan error-forward', async () => {
    const client = fakeClient();
    client.getRepos.mockResolvedValue([makeRepo()]);
    client.getConventions.mockResolvedValue({ scan: null, candidates: [] });
    const res = await getConventionsHandler(client)({ repo: 'acme/widget' });
    expect(res.isError).toBe(true);
    expect(resultText(res)).toMatch(/scan.*DevDigest UI/i);
  });

  it('rejects an unknown status filter, teaching the valid set', async () => {
    const client = fakeClient();
    const res = await getConventionsHandler(client)({ repo: 'acme/widget', status: 'bogus' });
    expect(res.isError).toBe(true);
    expect(resultText(res)).toContain('accepted');
  });
});

describe('devdigest_get_findings', () => {
  it('reads by repo+pr and shapes concise findings', async () => {
    const client = fakeClient();
    client.getRepos.mockResolvedValue([makeRepo()]);
    client.getPulls.mockResolvedValue([makePr({ number: 7, id: 'pull-1' })]);
    client.getReviews.mockResolvedValue([makeReview()]);
    const out = parseResult(
      await getFindingsHandler(client, testConfig)({ repo: 'acme/widget', pr: 7 }),
    );
    expect(out.verdict).toBe('comment');
    expect(out.findings).toContain('Possible null deref');
  });

  it('by run_id, a still-running run returns status guidance not findings', async () => {
    const client = fakeClient();
    rememberRun('run-1', 'pull-1');
    client.getRuns.mockResolvedValue([makeRun({ status: 'running' })]);
    const out = parseResult(
      await getFindingsHandler(client, testConfig)({ run_id: 'run-1' }),
    );
    expect(out.status).toBe('running');
    expect(client.getReviews).not.toHaveBeenCalled();
  });

  it('unknown run_id without repo+pr asks for repo+pr', async () => {
    const client = fakeClient();
    const res = await getFindingsHandler(client, testConfig)({ run_id: 'ghost' });
    expect(res.isError).toBe(true);
    expect(resultText(res)).toMatch(/repo.*pr/i);
  });

  it('rejects an invalid severity', async () => {
    const client = fakeClient();
    const res = await getFindingsHandler(client, testConfig)({
      run_id: 'run-1',
      repo: 'acme/widget',
      pr: 7,
      severity: 'LOUD',
    });
    expect(res.isError).toBe(true);
    expect(resultText(res)).toContain('CRITICAL');
  });
});

describe('devdigest_run_agent_on_pr', () => {
  function wire(client: ReturnType<typeof fakeClient>) {
    client.getRepos.mockResolvedValue([makeRepo()]);
    client.getPulls.mockResolvedValue([makePr({ number: 7, id: 'pull-1' })]);
    client.getAgents.mockResolvedValue([makeAgent({ id: 'agent-1', name: 'Reviewer' })]);
    client.startReview.mockResolvedValue({
      pr_id: 'pull-1',
      runs: [{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Reviewer' }],
      reviews: [],
    });
  }

  it('happy path: start → poll done → assemble findings', async () => {
    const client = fakeClient();
    wire(client);
    client.getRuns.mockResolvedValue([makeRun({ status: 'done' })]);
    client.getReviews.mockResolvedValue([makeReview()]);
    const out = parseResult(
      await runAgentOnPrHandler(client, fastConfig)({ repo: 'acme/widget', pr: 7, agent: 'Reviewer' }),
    );
    expect(out.status).toBe('done');
    expect(out.run_id).toBe('run-1');
    expect(out.score).toBe(78);
    expect(out.findings).toContain('<untrusted_content source="pr_findings">');
  });

  it('timeout while running returns SUCCESS with resume_with', async () => {
    const client = fakeClient();
    wire(client);
    client.getRuns.mockResolvedValue([makeRun({ status: 'running' })]);
    const res = await runAgentOnPrHandler(client, { ...fastConfig, runMaxWaitMs: 5 })({
      repo: 'acme/widget',
      pr: 7,
      agent: 'Reviewer',
    });
    expect(res.isError).toBeFalsy();
    const out = parseResult(res);
    expect(out.status).toBe('running');
    expect(out.resume_with).toBe('devdigest_get_findings');
  });

  it('missing provider key yields an actionable message naming the provider', async () => {
    const client = fakeClient();
    wire(client);
    client.getRuns.mockResolvedValue([
      makeRun({ status: 'failed', error: 'OPENROUTER_API_KEY is not configured' }),
    ]);
    const res = await runAgentOnPrHandler(client, fastConfig)({
      repo: 'acme/widget',
      pr: 7,
      agent: 'Reviewer',
    });
    expect(res.isError).toBe(true);
    const text = resultText(res);
    expect(text).toContain('OPENROUTER_API_KEY');
    expect(text).toMatch(/Settings/);
    expect(text).not.toContain('500');
  });

  it('bad repo format is caught before any network call', async () => {
    const client = fakeClient();
    const res = await runAgentOnPrHandler(client, fastConfig)({
      repo: 'not-a-repo',
      pr: 7,
      agent: 'Reviewer',
    });
    expect(res.isError).toBe(true);
    expect(resultText(res)).toContain('owner/name');
    expect(client.getRepos).not.toHaveBeenCalled();
  });
});

describe('devdigest_get_blast_radius', () => {
  const fullBlast = {
    changed_symbols: [{ name: 'chargeCard', file: 'src/billing.ts', kind: 'function' }],
    downstream: [
      {
        symbol: 'chargeCard',
        callers: [{ name: 'checkoutHandler', file: 'src/checkout.ts', line: 42 }],
        endpoints_affected: ['POST /checkout'],
        crons_affected: ['nightly-reconcile'],
      },
    ],
    summary: 'Changing chargeCard affects checkout.',
    index_state: { status: 'full', reason: null },
  };

  function wire(client: ReturnType<typeof fakeClient>) {
    client.getRepos.mockResolvedValue([makeRepo()]);
    client.getPulls.mockResolvedValue([makePr({ number: 7, id: 'pull-1' })]);
  }

  it('resolves repo+pr, shapes the impact map, and wraps repo-derived text untrusted', async () => {
    const client = fakeClient();
    wire(client);
    client.getBlastRadius.mockResolvedValue(fullBlast);
    const out = parseResult(await blastRadiusHandler(client)({ repo: 'acme/widget', pr: 7 }));
    expect(client.getBlastRadius).toHaveBeenCalledWith('pull-1');
    // Names are wrapped untrusted, and there is NO index note when index is full.
    expect(out.impact).toContain('<untrusted_content source="pr_blast_radius">');
    expect(out.impact).toContain('chargeCard');
    expect(out.impact).toContain('src/checkout.ts:42');
    expect(out.impact).toContain('POST /checkout');
    expect(out.index_note).toBeUndefined();
    expect(out.index_state.status).toBe('full');
  });

  it('prepends an index-incomplete note when index_state is not full', async () => {
    const client = fakeClient();
    wire(client);
    client.getBlastRadius.mockResolvedValue({
      changed_symbols: [],
      downstream: [],
      summary: 'partial',
      index_state: { status: 'degraded', reason: 'index_failed' },
    });
    const out = parseResult(await blastRadiusHandler(client)({ repo: 'acme/widget', pr: 7 }));
    expect(out.index_note).toMatch(/degraded/);
    expect(out.index_note).toMatch(/index_failed/);
    expect(out.note).toMatch(/No changed symbols/i);
  });

  it('bad repo format is caught before any network call', async () => {
    const client = fakeClient();
    const res = await blastRadiusHandler(client)({ repo: 'not-a-repo', pr: 7 });
    expect(res.isError).toBe(true);
    expect(resultText(res)).toContain('owner/name');
    expect(client.getRepos).not.toHaveBeenCalled();
  });
});
