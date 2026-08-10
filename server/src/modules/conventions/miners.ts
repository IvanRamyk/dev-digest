import type { ConventionCategory } from '@devdigest/shared';
import {
  CHOKEPOINT_MIN_FANIN,
  MIN_LAYERING_DIR_SIZE,
  MIN_PLACEMENT_REPEATS,
  MIN_ROLE_POPULATION,
} from './constants.js';
import type { MinedPattern } from './types.js';

/**
 * S3b — structural mining. Code, no model. This is the stage that makes
 * types A (chokepoint), B (role contract), and E (layering) reachable — they
 * are graph/population properties invisible inside any single file, which is
 * exactly what a batch-of-file-bodies pipeline (S4b) misses.
 *
 * Every miner applies the "could it be otherwise" test: a regularity with no
 * viable alternative present in the repo is not a convention and is discarded
 * here, before the model ever sees it. Each function is pure over rows the
 * repository hands it — no Postgres, no clone, no model — so it unit-tests
 * with plain fixtures.
 */

// ---------------------------------------------------------------------------
// A — Chokepoint: ∀ consumer of external dep R → imports internal module M
// ---------------------------------------------------------------------------

export interface ChokepointCtx {
  /** Internal import graph (file_edges): fromFile imports toFile. */
  edges: Array<{ fromFile: string; toFile: string }>;
  /** Direct external (non-relative) imports observed in sample files, with
   *  the source line already resolved (miners.ts stays pure over primitives —
   *  line resolution from file content happens in service.ts). */
  externalImports: Array<{ file: string; source: string; line: number }>;
}

/**
 * A chokepoint: external package R has EXACTLY ONE internal direct importer M
 * (the "could it be otherwise" test — if two+ files import R directly, R has
 * no gateway, so there is nothing to report), and M's fan-in (files that
 * import M) is at least `CHOKEPOINT_MIN_FANIN`.
 *
 * `support` = M's fan-in (how many files route through the gateway).
 * `violation` = always 0 here: a second direct importer of R makes the whole
 * candidate not-a-chokepoint (excluded above), so there is no partial case.
 */
export function mineChokepoints(ctx: ChokepointCtx): MinedPattern[] {
  const fanIn = new Map<string, number>();
  for (const e of ctx.edges) {
    fanIn.set(e.toFile, (fanIn.get(e.toFile) ?? 0) + 1);
  }

  const importersByExternal = new Map<string, Array<{ file: string; line: number }>>();
  for (const imp of ctx.externalImports) {
    const arr = importersByExternal.get(imp.source);
    if (arr) {
      if (!arr.some((x) => x.file === imp.file)) arr.push({ file: imp.file, line: imp.line });
    } else {
      importersByExternal.set(imp.source, [{ file: imp.file, line: imp.line }]);
    }
  }

  const out: MinedPattern[] = [];
  for (const [external, importers] of importersByExternal) {
    if (importers.length !== 1) continue; // multiple direct importers → no gateway
    const gateway = importers[0]!;
    const fan = fanIn.get(gateway.file) ?? 0;
    if (fan < CHOKEPOINT_MIN_FANIN) continue;
    out.push({
      kind: 'chokepoint',
      category: 'structure',
      facts: { module: gateway.file, external, fanIn: fan },
      evidence: {
        path: gateway.file,
        startLine: gateway.line,
        endLine: gateway.line,
        snippet: `import … from '${external}'`,
      },
      supportCount: fan,
      violationCount: 0,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// B — Role contract: ∀ x ∈ Role, P(x) — the population, not a guess
// ---------------------------------------------------------------------------

export interface RoleContractCtx {
  /** File paths carrying at least one HTTP endpoint registration
   *  (file_facts.endpoints) — the full handler population. */
  endpointFiles: string[];
  /** Exported symbol signatures declared in those files (symbols.signature). */
  signatures: Array<{ path: string; name: string; line: number; signature: string }>;
}

/** Crude return-type extraction: the text after the LAST `):` in a signature
 *  head (`async function h(req): Promise<Result<T, ApiError>>` → the tail). */
function returnHint(signature: string): string | null {
  const idx = signature.lastIndexOf('):');
  if (idx === -1) return null;
  const hint = signature.slice(idx + 2).trim();
  return hint.length > 0 ? hint : null;
}

/**
 * Groups handler signatures by their return-type hint. When one hint covers a
 * STRICT MAJORITY of the population (the "could it be otherwise" test — a
 * near-even split means there's a real, live alternative in this repo, so it
 * isn't a convention) and the population clears `MIN_ROLE_POPULATION`, emits
 * a role-contract candidate: "all handlers return `<hint>`".
 */
export function mineRoleContracts(ctx: RoleContractCtx): MinedPattern[] {
  const population = ctx.signatures.filter((s) => ctx.endpointFiles.includes(s.path));
  if (population.length < MIN_ROLE_POPULATION) return [];

  const groups = new Map<string, typeof population>();
  for (const s of population) {
    const hint = returnHint(s.signature);
    if (!hint) continue;
    const arr = groups.get(hint);
    if (arr) arr.push(s);
    else groups.set(hint, [s]);
  }

  let best: { hint: string; rows: typeof population } | null = null;
  for (const [hint, rows] of groups) {
    if (!best || rows.length > best.rows.length) best = { hint, rows };
  }
  if (!best) return [];
  if (best.rows.length <= population.length / 2) return []; // no clear majority — could be otherwise

  const first = best.rows[0]!;
  return [
    {
      kind: 'role_contract',
      category: 'api',
      facts: { returnType: best.hint, population: population.length, matching: best.rows.length },
      evidence: { path: first.path, startLine: first.line, endLine: first.line, snippet: first.signature },
      supportCount: best.rows.length,
      violationCount: population.length - best.rows.length,
    },
  ];
}

// ---------------------------------------------------------------------------
// E — Layering: ∀ edge A→B: forbidden (directory-aggregated graph)
// ---------------------------------------------------------------------------

export interface LayeringCtx {
  edges: Array<{ fromFile: string; toFile: string }>;
  files: string[];
}

/**
 * First meaningful path segment: skips a leading `src/` (near-universal in
 * this codebase's packages) so `src/platform/x.ts` groups under `platform`,
 * not the uninformative `src`. Falls back to the literal first segment
 * otherwise (e.g. a monorepo root: `client/`, `server/`, `reviewer-core/`).
 */
function layeringDir(path: string): string {
  const parts = path.split('/');
  if (parts[0] === 'src' && parts.length > 1) return parts[1]!;
  return parts[0] ?? path;
}

/**
 * Proposes a directory pair as an intentional layering boundary only when
 * BOTH directories clear `MIN_LAYERING_DIR_SIZE` (large enough that "they
 * just never happened to interact" is implausible) AND the edge count
 * between them, in either direction, is exactly zero.
 */
export function mineLayering(ctx: LayeringCtx): MinedPattern[] {
  const dirSize = new Map<string, number>();
  for (const f of ctx.files) {
    const d = layeringDir(f);
    dirSize.set(d, (dirSize.get(d) ?? 0) + 1);
  }

  const edgeCount = new Map<string, number>();
  for (const e of ctx.edges) {
    const a = layeringDir(e.fromFile);
    const b = layeringDir(e.toFile);
    if (a === b) continue;
    const key = `${a}->${b}`;
    edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
  }

  const dirs = [...dirSize.keys()].filter((d) => (dirSize.get(d) ?? 0) >= MIN_LAYERING_DIR_SIZE);
  const out: MinedPattern[] = [];
  const seen = new Set<string>();
  for (const a of dirs) {
    for (const b of dirs) {
      if (a >= b) continue;
      const pairKey = `${a}|${b}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);
      const forward = edgeCount.get(`${a}->${b}`) ?? 0;
      const backward = edgeCount.get(`${b}->${a}`) ?? 0;
      if (forward + backward > 0) continue;
      const anchor = ctx.files.find((f) => layeringDir(f) === a) ?? a;
      out.push({
        kind: 'layering',
        category: 'structure',
        facts: { a, b, sizeA: dirSize.get(a), sizeB: dirSize.get(b) },
        evidence: { path: anchor, startLine: 1, endLine: 1, snippet: '' },
        supportCount: (dirSize.get(a) ?? 0) + (dirSize.get(b) ?? 0),
        violationCount: 0,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// D — Placement: path pattern (file list only, no contents)
// ---------------------------------------------------------------------------

/**
 * A component-like file (`PascalCase.tsx`/`.ts`) that lives in a directory of
 * the same name (`Foo/Foo.tsx`). "Could it be otherwise" test: emitted only
 * when matches strictly outnumber same-shaped mismatches — otherwise there's
 * a live counter-example pattern in the same repo.
 */
export function minePlacement(paths: string[]): MinedPattern[] {
  const matches: string[] = [];
  const mismatches: string[] = [];
  for (const p of paths) {
    const parts = p.split('/');
    if (parts.length < 2) continue;
    const file = parts[parts.length - 1]!;
    const dir = parts[parts.length - 2]!;
    const m = file.match(/^([A-Za-z0-9_]+)\.(tsx|ts)$/);
    if (!m) continue;
    const base = m[1]!;
    if (base === 'index') continue;
    if (base === dir) matches.push(p);
    else if (/^[A-Z]/.test(base)) mismatches.push(p);
  }
  if (matches.length < MIN_PLACEMENT_REPEATS) return [];
  if (matches.length <= mismatches.length) return [];

  const category: ConventionCategory = 'structure';
  return [
    {
      kind: 'placement',
      category,
      facts: { matches: matches.length, mismatches: mismatches.length },
      evidence: { path: matches[0]!, startLine: 1, endLine: 1, snippet: '' },
      supportCount: matches.length,
      violationCount: mismatches.length,
    },
  ];
}
