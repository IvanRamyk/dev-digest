import { parse, Lang } from '@ast-grep/napi';
import type { ChatMessage, GitClient, LLMProvider, RepoRef } from '@devdigest/shared';
import { langForFile } from '../../adapters/astgrep/index.js';
import {
  computeConfidence,
  isSafeGrepPattern,
  isSafeRepoRelativePath,
} from './helpers.js';
import { buildJudgeMessage, JUDGE_SYSTEM_PROMPT } from './prompts.js';
import { ConventionJudgementSchema } from './schemas.js';
import { JUDGE_FILES_PER_RULE, JUDGE_FILE_LINES, MAX_JUDGE_CALLS, MIN_SUPPORT_FILES } from './constants.js';
import type { Evidence, RawCandidate, VerifiedCandidate } from './types.js';

/**
 * S6 — evidence verification. This is the part that makes findings
 * trustworthy: code answers "does this evidence exist?" and "does this
 * pattern hold?"; a second cheap model call answers "does this semantic claim
 * hold?" only when a pattern can't. See specs/conventions.md §3.
 */

export type VerifyOutcome =
  | { kind: 'dropped' } // evidence anchoring failed — no card without path:lines
  | { kind: 'refuted' } // verification ran cleanly and came back negative
  | { kind: 'kept'; candidate: VerifiedCandidate };

// ---------------------------------------------------------------------------
// Evidence anchoring
// ---------------------------------------------------------------------------

function firstNonEmptyLine(snippet: string): string | null {
  for (const line of snippet.split('\n')) {
    const t = line.trim();
    if (t.length > 0) return t;
  }
  return null;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function findLine(lines: string[], wanted: string, from: number, to: number): number {
  const lo = Math.max(0, from);
  const hi = Math.min(lines.length - 1, to);
  for (let i = lo; i <= hi; i++) {
    const norm = normalize(lines[i] ?? '');
    if (norm.length === 0) continue;
    if (norm.includes(wanted) || wanted.includes(norm)) return i;
  }
  return -1;
}

/**
 * Does the evidence exist? Path guard → resolve in the sample map (or ONE
 * `git.readFile`, caught) → search a `±EVIDENCE_LINE_TOLERANCE` window around
 * the claimed lines → self-heal by scanning the whole file on a miss → drop
 * on a miss everywhere. The returned snippet is ALWAYS re-derived from the
 * file, never the model's text — this also neutralises a model echoing
 * injected repo text back into the persisted card.
 */
export async function anchorEvidence(
  candidate: RawCandidate,
  contentMap: Map<string, string[]>,
  git: GitClient,
  repo: RepoRef,
  tolerance: number,
): Promise<Evidence | null> {
  const path = candidate.evidence.path;
  if (!isSafeRepoRelativePath(path)) return null;

  let lines = contentMap.get(path);
  if (!lines) {
    try {
      const content = await git.readFile(repo, path);
      lines = content.split('\n');
      contentMap.set(path, lines);
    } catch {
      return null; // a hallucinated file is a hallucinated rule
    }
  }

  const wanted = firstNonEmptyLine(candidate.evidence.snippet);
  if (!wanted) return null;
  const wantedNorm = normalize(wanted);

  const claimedStart = candidate.evidence.startLine - 1;
  const claimedEnd = candidate.evidence.endLine - 1;

  let hit = findLine(lines, wantedNorm, claimedStart - tolerance, claimedEnd + tolerance);
  if (hit === -1) hit = findLine(lines, wantedNorm, 0, lines.length - 1); // self-heal
  if (hit === -1) return null;

  const spanLen = Math.max(1, candidate.evidence.endLine - candidate.evidence.startLine + 1);
  const snippetLines = lines.slice(hit, Math.min(lines.length, hit + spanLen));
  return {
    path,
    startLine: hit + 1,
    endLine: hit + snippetLines.length,
    snippet: snippetLines.join('\n'),
  };
}

// ---------------------------------------------------------------------------
// S6a — pattern rules, counted by ast-grep (code, free)
// ---------------------------------------------------------------------------

/**
 * `null` = the pattern could not be evaluated at all (didn't compile against
 * any supported file, or no sample file has a supported language) — the
 * caller falls through to S6b rather than dropping the candidate. Otherwise
 * the number of distinct sample files where the pattern matched at least once.
 */
export function countPattern(pattern: string, contentMap: Map<string, string[]>): number | null {
  if (!isWellFormedPattern(pattern)) return null;
  let evaluated = false;
  let count = 0;
  for (const [path, lines] of contentMap) {
    const lang = langForFile(path);
    if (!lang) continue;
    try {
      const root = parse(lang as Lang, lines.join('\n')).root();
      const matches = root.findAll({ rule: { pattern } });
      evaluated = true;
      if (matches.length > 0) count++;
    } catch {
      // this file's grammar choked on the pattern; if we've already proven
      // the pattern compiles against another file, treat this one file as a
      // non-match rather than invalidating the whole pattern.
      if (!evaluated) continue;
    }
  }
  return evaluated ? count : null;
}

/** Cheap syntactic pre-check: ast-grep's pattern matcher is lenient and will
 *  silently match zero results for garbage input rather than throwing, so an
 *  unbalanced-bracket pattern (the common shape of "not a real pattern") is
 *  rejected here before it ever reaches ast-grep. Not a full parser — just
 *  enough to distinguish "malformed" from "valid but rare". */
function isWellFormedPattern(pattern: string): boolean {
  const closerFor: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const openers = new Set(['(', '[', '{']);
  const stack: string[] = [];
  for (const ch of pattern) {
    if (openers.has(ch)) stack.push(ch);
    else if (ch in closerFor) {
      if (stack.pop() !== closerFor[ch]) return false;
    }
  }
  return stack.length === 0;
}

// ---------------------------------------------------------------------------
// ConventionVerifier — orchestrates S6a → S6b with the judge-call budget
// ---------------------------------------------------------------------------

export interface VerifierDeps {
  git: GitClient;
  repo: RepoRef;
  llm: LLMProvider;
  model: string;
}

export class ConventionVerifier {
  private judgeCallsUsed = 0;

  constructor(private deps: VerifierDeps) {}

  get judgeCallsRemaining(): number {
    return Math.max(0, MAX_JUDGE_CALLS - this.judgeCallsUsed);
  }

  /**
   * Verify one S4b (model-authored) candidate against the shared S3 content
   * map. Config and mined candidates never reach this method — they're
   * resolved directly in service.ts (S7 mapping), since their support was
   * already established without a model in the loop.
   */
  async verify(candidate: RawCandidate, contentMap: Map<string, string[]>): Promise<VerifyOutcome> {
    const evidence = await anchorEvidence(candidate, contentMap, this.deps.git, this.deps.repo, 2);
    if (!evidence) return { kind: 'dropped' };

    if (candidate.verifiable === 'pattern' && candidate.supportPattern && isSafeGrepPattern(candidate.supportPattern)) {
      const support = countPattern(candidate.supportPattern, contentMap);
      if (support !== null) {
        const violation =
          candidate.violationPattern && isSafeGrepPattern(candidate.violationPattern)
            ? (countPattern(candidate.violationPattern, contentMap) ?? 0)
            : 0;
        if (support < MIN_SUPPORT_FILES) return { kind: 'refuted' };
        if (violation > support) return { kind: 'refuted' };
        return {
          kind: 'kept',
          candidate: {
            rule: candidate.rule,
            category: candidate.category,
            evidence,
            source: candidate.source,
            verification: 'pattern',
            supportCount: support,
            violationCount: violation,
            confidence: computeConfidence(support, violation, 'pattern'),
          },
        };
      }
      // pattern didn't compile against anything → fall through to the judge.
    }

    return this.judge(candidate, evidence, contentMap);
  }

  private async judge(
    candidate: RawCandidate,
    evidence: Evidence,
    contentMap: Map<string, string[]>,
  ): Promise<VerifyOutcome> {
    if (this.judgeCallsRemaining <= 0) {
      return {
        kind: 'kept',
        candidate: unverified(candidate, evidence),
      };
    }

    const neighbours = pickNeighbourFiles(evidence.path, contentMap, JUDGE_FILES_PER_RULE);
    if (neighbours.length === 0) {
      return { kind: 'kept', candidate: unverified(candidate, evidence) };
    }

    this.judgeCallsUsed++;
    const messages: ChatMessage[] = [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      ...buildJudgeMessage(candidate.rule, neighbours),
    ];

    let verdicts: { file: string; verdict: 'follows' | 'violates' | 'not_applicable' }[];
    try {
      const res = await this.deps.llm.completeStructured({
        model: this.deps.model,
        schema: ConventionJudgementSchema,
        schemaName: 'ConventionJudgement',
        messages,
        temperature: 0,
        maxTokens: 800,
      });
      verdicts = res.data.verdicts;
    } catch {
      return { kind: 'kept', candidate: unverified(candidate, evidence) };
    }

    const support = verdicts.filter((v) => v.verdict === 'follows').length;
    const violation = verdicts.filter((v) => v.verdict === 'violates').length;
    if (support === 0 && violation > 0) return { kind: 'refuted' };
    if (violation > support) return { kind: 'refuted' };

    return {
      kind: 'kept',
      candidate: {
        rule: candidate.rule,
        category: candidate.category,
        evidence,
        source: candidate.source,
        verification: 'semantic',
        supportCount: support,
        violationCount: violation,
        confidence: computeConfidence(support, violation, 'semantic'),
      },
    };
  }
}

function unverified(candidate: RawCandidate, evidence: Evidence): VerifiedCandidate {
  return {
    rule: candidate.rule,
    category: candidate.category,
    evidence,
    source: candidate.source,
    verification: 'unverified',
    supportCount: 0,
    violationCount: 0,
    confidence: computeConfidence(0, 0, 'unverified'),
  };
}

/** Same-directory sample files first, then any other sample files, excluding
 *  the evidence file itself, truncated to `JUDGE_FILE_LINES` lines each. */
function pickNeighbourFiles(
  evidencePath: string,
  contentMap: Map<string, string[]>,
  limit: number,
): Array<{ path: string; snippet: string }> {
  const dir = evidencePath.includes('/') ? evidencePath.slice(0, evidencePath.lastIndexOf('/')) : '';
  const candidates = [...contentMap.entries()].filter(([path]) => path !== evidencePath);
  candidates.sort(([a], [b]) => {
    const aSame = a.startsWith(dir) ? 0 : 1;
    const bSame = b.startsWith(dir) ? 0 : 1;
    return aSame - bSame;
  });
  return candidates.slice(0, limit).map(([path, lines]) => ({
    path,
    snippet: lines.slice(0, JUDGE_FILE_LINES).join('\n'),
  }));
}
