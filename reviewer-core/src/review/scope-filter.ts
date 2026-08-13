import type { Finding, Severity } from '@devdigest/shared';

/**
 * Pure post-grounding scope filter.
 *
 * Runs AFTER the shared citation-grounding gate as a second, independent
 * post-step (reviewer-core invariant 4: grounding stays one shared gate; this
 * does not touch it and is not a per-strategy copy). It re-shapes the SURVIVING
 * findings against the server-derived intent; the caller then re-derives the
 * score from the survivors so verdict/score/blocker count stay consistent
 * (invariant 3).
 *
 * The intent here is the same plain string-bag the prompt receives — NOT the Zod
 * `Intent` contract, so ring 0 stays free of the contract.
 */
export interface ScopeIntent {
  summary: string;
  inScope: string[];
  outOfScope: string[];
}

export interface ScopeFilterResult {
  /** Findings that stay (in-scope, or the single kept CRITICAL out-of-bounds). */
  kept: Finding[];
  /** Findings dropped as out-of-scope, with the matched scope entry as reason. */
  dropped: { finding: Finding; reason: string }[];
}

/**
 * Conservative match: a scope entry "matches" a finding when the entry text
 * appears (case-insensitively) as a substring of the finding's `file` or
 * `title`. Substring, not glob/regex — the entries are free-form model output,
 * so anything cleverer would over-drop. Empty entries never match.
 */
function scopeMatches(entry: string, finding: Finding): boolean {
  const needle = entry.trim().toLowerCase();
  if (needle.length === 0) return false;
  return (
    finding.file.toLowerCase().includes(needle) ||
    finding.title.toLowerCase().includes(needle)
  );
}

/** A finding is out-of-scope when some out_of_scope entry matches AND no
 *  in_scope entry does (in_scope wins ties — R6). */
function isOutOfScope(finding: Finding, intent: ScopeIntent): boolean {
  const inMatched = intent.inScope.some((e) => scopeMatches(e, finding));
  if (inMatched) return false;
  return intent.outOfScope.some((e) => scopeMatches(e, finding));
}

/** The out_of_scope entry that matched, for the drop reason / kept rationale. */
function matchedOutEntry(finding: Finding, intent: ScopeIntent): string | undefined {
  return intent.outOfScope.find((e) => scopeMatches(e, finding));
}

/**
 * Apply the scope filter. Out-of-scope findings are dropped EXCEPT exactly one
 * whose severity is `CRITICAL` — that single finding survives as the never-
 * silenced "serious problem outside the stated bounds" signal, with its
 * rationale annotated. All other out-of-scope findings (including any further
 * CRITICALs) are dropped. In-scope findings always pass through untouched.
 *
 * Total over the `Severity` enum: severity only gates which out-of-scope finding
 * is the one kept CRITICAL; every value is handled by the equality check.
 */
export function applyScopeFilter(findings: Finding[], intent: ScopeIntent): ScopeFilterResult {
  const kept: Finding[] = [];
  const dropped: { finding: Finding; reason: string }[] = [];
  let keptCriticalOutOfBounds = false;

  const OUT_OF_BOUNDS_NOTE =
    '\n\n_Flagged outside the PR’s stated scope, but kept because it is CRITICAL._';

  for (const finding of findings) {
    if (!isOutOfScope(finding, intent)) {
      kept.push(finding);
      continue;
    }
    const entry = matchedOutEntry(finding, intent) ?? '(out of scope)';
    const isCritical: boolean = (finding.severity satisfies Severity) === 'CRITICAL';
    if (isCritical && !keptCriticalOutOfBounds) {
      keptCriticalOutOfBounds = true;
      kept.push({ ...finding, rationale: finding.rationale + OUT_OF_BOUNDS_NOTE });
      continue;
    }
    dropped.push({ finding, reason: `out of scope: "${entry}"` });
  }

  return { kept, dropped };
}
