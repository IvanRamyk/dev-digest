/* helpers.ts — pure, presentation-shaped transforms for the Blast tab.
   No React, no fetch, no next/*. Single-consumer (this folder). */

import { INCOMPLETE_INDEX_STATUSES } from "./constants";
import type { BlastIndexState } from "@/lib/types";

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

/** A short `file:line` label for a caller row. */
export function callerLocation(file: string, line: number): string {
  return `${file}:${line}`;
}
