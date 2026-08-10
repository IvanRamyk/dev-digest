/* domain/time.ts — timestamp helpers shared by ordering rules. Pure. */

/** Epoch ms for sorting; missing/unparseable timestamps sort last (0). */
export function tsOf(iso: string | null | undefined): number {
  if (!iso) return 0;
  const n = Date.parse(iso);
  return Number.isNaN(n) ? 0 : n;
}
