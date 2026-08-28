/* helpers.ts — pure, presentation-shaped transforms for the Blast tab.
   No React, no fetch, no next/*. Single-consumer (this folder). */

import {
  INCOMPLETE_INDEX_STATUSES,
  ENDPOINT_METHOD_TOKENS,
  ENDPOINT_DEFAULT_TOKENS,
  TREE_BRANCH,
  TREE_LAST,
} from "./constants";
import type { BlastIndexState, BlastRadius } from "@/lib/types";

/** True when the code index is not `full` and the impact may be incomplete. */
export function isIncompleteIndex(state: BlastIndexState): boolean {
  return (INCOMPLETE_INDEX_STATUSES as readonly string[]).includes(state.status);
}

/**
 * Split a `"METHOD /path"` endpoint string into its parts for chip display.
 * Falls back to `{ method: "", path }` when the string has no leading method.
 */
export function parseEndpoint(endpoint: string): { method: string; path: string } {
  const idx = endpoint.indexOf(" ");
  if (idx === -1) return { method: "", path: endpoint };
  return { method: endpoint.slice(0, idx).toUpperCase(), path: endpoint.slice(idx + 1) };
}

/** Chip color tokens for an endpoint, keyed off its HTTP method. */
export function endpointTokens(method: string): { color: string; bg: string } {
  return ENDPOINT_METHOD_TOKENS[method] ?? ENDPOINT_DEFAULT_TOKENS;
}

/** A short `file:line` label for a caller row. */
export function callerLocation(file: string, line: number): string {
  return `${file}:${line}`;
}

/** The tree-guide glyph for a caller row given its position in the list. */
export function treeGuide(index: number, total: number): string {
  return index === total - 1 ? TREE_LAST : TREE_BRANCH;
}

export interface BlastStats {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/**
 * Headline counts for the stats strip. `callers` is the total across all
 * symbols; `endpoints`/`crons` are de-duplicated across the map so a route
 * reached from two symbols is counted once.
 */
export function blastStats(blast: BlastRadius): BlastStats {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let callers = 0;
  for (const impact of blast.downstream) {
    callers += impact.callers.length;
    impact.endpoints_affected.forEach((e) => endpoints.add(e));
    impact.crons_affected.forEach((c) => crons.add(c));
  }
  return {
    symbols: blast.changed_symbols.length,
    callers,
    endpoints: endpoints.size,
    crons: crons.size,
  };
}
