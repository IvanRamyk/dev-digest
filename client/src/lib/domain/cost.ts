/* domain/cost.ts — run cost and token formatting. Pure.

   Shared by every surface that shows a price (PR list column, agent runs
   timeline, run trace drawer) so the same run never renders two different-looking
   numbers. See client/INSIGHTS.md 2026-08-05 for why the numeric handling here is
   the way it is — toFixed(2) and `?? 0` are both wrong, for different reasons. */

/** Em-dash used across the app for "no data" (see PRRow's unreviewed score). */
export const NO_DATA = "—";

/**
 * USD cost, at 3 significant figures.
 *
 * Run costs sit in the $0.001–$0.05 band, so a fixed 2 decimals collapses most
 * of them to "$0.00" — exactly the signal this badge exists to show. Hence
 * toPrecision(3) with trailing zeros stripped: 0.0134 → "$0.0134",
 * 0.06 → "$0.06", 0.0013 → "$0.0013". At $1+ plain 2dp reads better.
 *
 * null/undefined → "—". A run with no cost is UNKNOWN (unpriced model, or it
 * never finished), not free. 0 is real data — a free model — and renders "$0".
 * Collapsing the two with `?? 0` labels a failed run "free".
 */
export function formatCost(usd: number | null | undefined): string {
  if (usd == null) return NO_DATA;
  if (usd === 0) return "$0";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  // toPrecision goes exponential below 1e-7 ("1.00e-7"); that is a hundredth of
  // a cent, so floor it rather than render unreadable scientific notation.
  if (usd < 1e-6) return "<$0.000001";
  // "0.0600" → "0.06"; "0.00130" → "0.0013". Safe to strip: toPrecision always
  // emits a decimal point here, so this never eats integer digits.
  const trimmed = usd.toPrecision(3).replace(/0+$/, "").replace(/\.$/, "");
  return `$${trimmed}`;
}

/** Total tokens with thousands separators, e.g. 9119 → "9,119". */
export function formatTokenTotal(tokensIn: number | null, tokensOut: number | null): string {
  return ((tokensIn ?? 0) + (tokensOut ?? 0)).toLocaleString("en-US");
}
