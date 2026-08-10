/* RunCostBadge — what one agent run cost. Used in the PR list's COST column
   ("compact") and on each Agent runs timeline row ("with-tokens").
   The run trace drawer imports formatCost directly for its COST stat tile. */
"use client";

import { formatCost, formatTokenTotal } from "@/lib/domain/cost";
import { s } from "./styles";

export interface RunCostBadgeProps {
  /** USD cost. null = unknown (unpriced model / run never completed), not free. */
  costUsd: number | null | undefined;
  /** compact = cost only; with-tokens = "9,119 tok · $0.0013". */
  variant?: "compact" | "with-tokens";
  tokensIn?: number | null;
  tokensOut?: number | null;
}

/**
 * Renders the cost, or an em-dash when it is unknown. A free model shows "$0" —
 * that is data, not its absence, so the two must not collapse into one another.
 *
 * The "with-tokens" variant drops the token half when there are no tokens
 * (nothing ran), leaving just the em-dash rather than a bare "0 tok".
 */
export function RunCostBadge({
  costUsd,
  variant = "compact",
  tokensIn = null,
  tokensOut = null,
}: RunCostBadgeProps) {
  const cost = formatCost(costUsd);
  if (variant === "compact") {
    return (
      <span className="mono tnum" style={s.cost(costUsd == null)}>
        {cost}
      </span>
    );
  }
  const tokens = (tokensIn ?? 0) + (tokensOut ?? 0);
  if (tokens === 0) {
    return (
      <span className="mono tnum" style={s.cost(costUsd == null)}>
        {cost}
      </span>
    );
  }
  return (
    <span className="mono tnum" style={s.usage}>
      {formatTokenTotal(tokensIn, tokensOut)} tok · {cost}
    </span>
  );
}

export default RunCostBadge;
