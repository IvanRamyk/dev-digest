import type { ConventionCandidate } from "@/lib/types";

/** Accepted first, then verified candidates by confidence DESC, then ALL
    `unverified` last under a divider — they're suggestions, not findings, and
    must not be the first thing the user sees. */
export function sortCandidates(candidates: ConventionCandidate[]): ConventionCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.status === "accepted" && b.status !== "accepted") return -1;
    if (b.status === "accepted" && a.status !== "accepted") return 1;
    const aUnverified = a.verification === "unverified";
    const bUnverified = b.verification === "unverified";
    if (aUnverified !== bUnverified) return aUnverified ? 1 : -1;
    return b.confidence - a.confidence;
  });
}

/** Index of the first unverified card in a `sortCandidates`-ordered list, or
    -1 if there isn't one — used to render the divider once. */
export function firstUnverifiedIndex(sorted: ConventionCandidate[]): number {
  return sorted.findIndex((c) => c.verification === "unverified");
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
