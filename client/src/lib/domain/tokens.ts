/* domain/tokens.ts — client-side token size estimate. Pure.

   Mirrors the server's fallback heuristic (server/src/adapters/tokenizer/index.ts
   `approxTokens`) — chars/4, not tiktoken. Two consumers: the skill editor's live
   counter and the trace drawer's block badge, which is what promotes this out of
   a colocated helpers.ts (C12). The number is a size cue, not a billing figure. */

/** Rough token estimate for a body of text. Approximate — label it as such in the UI. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
