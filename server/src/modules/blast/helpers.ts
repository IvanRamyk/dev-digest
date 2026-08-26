import type {
  BlastCaller,
  BlastIndexState,
  BlastRadius,
  ChangedSymbol,
  DownstreamImpact,
} from '@devdigest/shared';
import type { BlastResult, IndexState } from '../repo-intel/types.js';
import { DEFAULT_BLAST_SUMMARY, MAX_CALLERS_PER_SYMBOL } from './constants.js';

/**
 * Pure mapping: the repo-intel facade's `BlastResult` → the wire `BlastRadius`.
 * No I/O, no dates, no randomness. Total over the facade union, including the
 * degraded path where `factsByFile` is absent and every `rank` is 0.
 *
 * The facade already excludes the declaration file from `callers` and returns
 * `viaSymbol` per caller, so grouping is a fold over that field. Endpoints/crons
 * are attributed to a symbol by unioning the per-caller-file facts across the
 * group's caller files; when `factsByFile` is absent (degraded), we fall back to
 * the flat `impactedEndpoints` at the map level (attached to every group so the
 * information is not lost — R5).
 */
export function mapBlastResult(result: BlastResult, indexState: IndexState): BlastRadius {
  const changed_symbols: ChangedSymbol[] = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  // Group callers by the changed symbol they reach, preserving first-seen order.
  const groups = new Map<string, typeof result.callers>();
  for (const caller of result.callers) {
    const bucket = groups.get(caller.viaSymbol);
    if (bucket) bucket.push(caller);
    else groups.set(caller.viaSymbol, [caller]);
  }

  const hasFacts = result.factsByFile !== undefined;

  const downstream: DownstreamImpact[] = [];
  for (const [symbol, callerRows] of groups) {
    // Rank-desc, then cap. `slice` on a stable order is fine even when every
    // rank is 0 on the degraded/ripgrep path (R5).
    const sorted = [...callerRows].sort((a, b) => b.rank - a.rank);
    const capped = sorted.slice(0, MAX_CALLERS_PER_SYMBOL);
    const callers: BlastCaller[] = capped.map((c) => ({
      name: c.symbol,
      file: c.file,
      line: c.line,
    }));

    let endpoints_affected: string[];
    let crons_affected: string[];
    if (hasFacts) {
      // Attribute from the per-caller-file facts, unioned across this group's
      // caller files (use the full group, not just the capped slice, so a
      // capped-out caller's endpoint is not dropped).
      const facts = result.factsByFile!;
      const endpoints = new Set<string>();
      const crons = new Set<string>();
      for (const c of callerRows) {
        const f = facts[c.file];
        if (!f) continue;
        for (const e of f.endpoints) endpoints.add(e);
        for (const cr of f.crons) crons.add(cr);
      }
      endpoints_affected = [...endpoints];
      crons_affected = [...crons];
    } else {
      // Degraded path: no per-file facts. Fall back to the flat map-level
      // endpoints, and no cron attribution is available.
      endpoints_affected = [...result.impactedEndpoints];
      crons_affected = [];
    }

    downstream.push({ symbol, callers, endpoints_affected, crons_affected });
  }

  const index_state: BlastIndexState = {
    status: indexState.status,
    reason: indexState.degradedReason ?? indexState.reason ?? null,
  };

  return {
    changed_symbols,
    downstream,
    summary: DEFAULT_BLAST_SUMMARY,
    index_state,
  };
}

/**
 * Pure prompt body for the optional summary. NAMES and COUNTS only — never diff
 * bodies, never patch text. Built from an already-mapped `BlastRadius`, so what
 * the model sees is exactly what the client sees (mirrors intent's discipline).
 */
export function buildSummaryPrompt(map: BlastRadius): string {
  const symbolNames = map.changed_symbols.map((s) => s.name);
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  const callerSummaries: string[] = [];
  for (const d of map.downstream) {
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
    const topCallers = d.callers.slice(0, 5).map((c) => c.name);
    callerSummaries.push(
      `${d.symbol}: ${d.callers.length} caller(s)` +
        (topCallers.length > 0 ? ` (e.g. ${topCallers.join(', ')})` : ''),
    );
  }

  const parts: string[] = [
    `Changed symbols (${symbolNames.length}): ${symbolNames.join(', ') || '(none)'}`,
    `Downstream callers by symbol:\n${callerSummaries.join('\n') || '(none)'}`,
    `Affected endpoints (${endpoints.size}): ${[...endpoints].join(', ') || '(none)'}`,
    `Affected cron jobs (${crons.size}): ${[...crons].join(', ') || '(none)'}`,
    `Index state: ${map.index_state.status}${map.index_state.reason ? ` (${map.index_state.reason})` : ''}`,
  ];
  return parts.join('\n\n');
}
