---
name: pr-self-review
description: Reviews all open local changes before a pull request is opened, routing this repo's audit skills at the files they actually govern — UI skills on client files, architecture skills on backend files — and blocks the push when a verified CRITICAL finding survives. Use before opening a PR, before `git push`, when the pre-PR hook asks for a review, and whenever the user asks to self-review, pre-review, or gate local changes. It does not re-audit untouched code, does not review a merged or remote PR, and does not replace `/code-review` — that hunts bugs by angle, this one enforces this repo's documented architecture rules at the pre-PR boundary.
version: 1.0.0
user-invocable: true
---

# PR self review — the gate before the pull request

One entry point that reads every open change, dispatches only the reviewers whose
scope intersects those files, normalizes their output into **this repo's own**
severity vocabulary, and stamps a verdict the push hook can act on.

Companion files: [routing.md](routing.md) — path → reviewer dispatch ·
[severity.md](severity.md) — rule id → `CRITICAL`/`WARNING`/`SUGGESTION`.

## The vocabulary is the product's, not this skill's

`server/src/vendor/shared/contracts/findings.ts` is authoritative and wins on any
conflict with this file:

- `Severity = ['CRITICAL', 'WARNING', 'SUGGESTION']` (L11)
- `Verdict = ['request_changes', 'approve', 'comment']` (L40)
- `FindingCategory = ['bug', 'security', 'perf', 'style', 'test']` (L27)
- `FindingsBySeverity` (L19–23) — `{0,0,0}` means *reviewed and clean*; **absent**
  means *never reviewed*. The stamp preserves that distinction; do not collapse them.

Never invent a fourth severity or a second verdict name.

## Two inherited guards

Both come from the audit modes this skill delegates to, and both are load-bearing:

1. **Changed lines only.** A pre-existing violation in an untouched line is out of
   scope and is not a finding. 40 of 46 client component folders predate `C1`–`C16`
   (`client-architecture/migration.md`) — auditing them would bury the real diff.
2. **A clean diff gets one line saying so.** Zero findings is a correct outcome. Do
   not manufacture a finding to look thorough.

---

## Phase 0 — Resolve scope

```bash
BASE=$(git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null) \
  || BASE=origin/main
git diff --name-only "$BASE"...HEAD      # what this branch added
git diff --name-only HEAD                # uncommitted work — often the whole point
git ls-files --others --exclude-standard # untracked; invisible to `diff HEAD`
```

Union all three. If `@{upstream}` is unset, try `origin/main`, then `main`, then
`HEAD~1`. **State which base was used** in the report — a silently wrong base is the
failure mode of this whole skill, and it is invisible in the output unless named.

Exclude, per the root `CLAUDE.md` **Do not touch**:

```
*/vendor/shared/  client/src/vendor/ui/  server/src/db/migrations/*
*/INSIGHTS.md  pnpm-lock.yaml  package-lock.json  *.snap
```

Empty union → verdict `approve`, write a clean stamp, one line, stop.

## Phase 1 — Route

Read [routing.md](routing.md), classify each surviving path, collect the reviewer set.
Two rules keep the dispatch honest:

- **A reviewer receives only its own files.** Do not hand the whole diff to
  `onion-architecture` and hope it ignores `client/`.
- **Print the routing decision before reviewing** — which reviewers fired, which were
  skipped, and why. That table is what makes a surprising verdict debuggable.

No reviewer matched → `approve`, clean stamp, and say that the diff was
docs/config/e2e only.

## Phase 2 — Fan out

One `Agent` per matched reviewer, **all in a single message** so they run
concurrently. Each prompt carries:

- its file list (only its own) and the base ref
- the skill to invoke, with an instruction to use that skill's **Audit mode**
- both inherited guards, verbatim
- an instruction to return findings in the skill's native report block **with its own
  severity label unmodified** — normalization happens in one place, in Phase 3, not
  in four reviewers with four different scales

Run the deterministic pre-checks first, before any LLM judgment — they are free and
they never hallucinate:

```bash
rg 'from "[^"]*app/' client/src/components client/src/lib   # C1 — must be empty
rg 'queryKey: \[' client/src/app client/src/components      # C15 — must be empty
rg 'invalidateQueries' client/src/app client/src/components # C15 — must be empty
rg "from 'drizzle-orm'" server/src/modules/*/routes.ts      # O6
rg "node:fs|from 'fastify'" server/src/modules/*/service.ts # O4
rg "node:fs|drizzle-orm|process\.env" reviewer-core/src/    # O1
```

A hit is a candidate, not a finding — it still has to sit on a changed line.

## Phase 3 — Normalize and dedupe

Apply [severity.md](severity.md). Dedupe by `file:line + rule`; when two reviewers
land on the same line, keep the higher severity and cite both rule ids.

## Phase 4 — Verify every CRITICAL adversarially

**A false CRITICAL hard-blocks a push.** That asymmetry is why this phase exists.

One verifier `Agent` per CRITICAL candidate, prompted to **refute**, defaulting to
demote-to-WARNING on uncertainty. Each must confirm three things independently:

1. the cited line is inside a hunk this diff actually changed;
2. the rule text says what the finding claims — **re-read the skill, do not trust the
   quote in the finding**;
3. `client/CLAUDE.md` / `server/CLAUDE.md` / `reviewer-core/CLAUDE.md` does not permit
   it. Both architecture skills declare those files authoritative and winning on
   conflict, so a rule that contradicts them loses.

Only survivors block. WARNING and SUGGESTION are not verified — they cost a comment,
not a blocked push.

## Phase 5 — Report

`ReportFindings` when available: ranked most-severe-first, `category` drawn from the
product's `FindingCategory` enum so it reads the same as the studio UI. Degrade to
`path:line — claim` one-liners when the tool is absent.

Lead with the verdict in the product's own words:

| Outcome | Verdict | Says |
|---|---|---|
| ≥1 verified CRITICAL | `request_changes` | **merge blocked** — push and PR-create are denied |
| WARNINGs only | `comment` | safe to open; these are review comments waiting to happen |
| nothing | `approve` | one line |

Then write the stamp and **stop. No edits without approval.** On approval, offer to
fix CRITICALs only — WARNING and SUGGESTION stay advisory, because the ask this skill
answers was specifically about blocking.

## Phase 6 — Stamp

`.git/devdigest-selfreview.json` — inside `.git`, so it is never committed, never
needs a `.gitignore` entry, and is per-clone by construction.

Get the hash from the gate script so the two can never drift:

```bash
HASH=$(.claude/hooks/pr-self-review-gate.sh --hash)
```

```json
{
  "head": "<git rev-parse HEAD>",
  "state_hash": "<from --hash>",
  "base": "origin/main",
  "verdict": "request_changes",
  "by_severity": { "CRITICAL": 2, "WARNING": 5, "SUGGESTION": 3 },
  "critical": [
    { "rule": "O4", "file": "server/src/modules/pulls/routes.ts", "line": 88,
      "summary": "queries `runs` directly instead of going through repository.ts" }
  ],
  "reviewers": ["onion-architecture", "security"],
  "skipped": ["client-architecture — no client files changed"]
}
```

`head` + `state_hash` are what make the stamp **fresh** rather than merely
**present** — touch any tracked file, or add an untracked one, and the hash moves, so
the stamp stops counting and the hook falls back to `ask`.

---

## How this gets triggered

A `PreToolUse` command hook on `Bash(git push:*)` and `Bash(gh pr create:*)`, wired in
`.claude/settings.json`, runs `.claude/hooks/pr-self-review-gate.sh`:

| Stamp state | Decision |
|---|---|
| absent | `ask` — names this skill, says continuing is fine |
| `head` or `state_hash` stale | `ask` — review is stale |
| fresh, `CRITICAL > 0` | **`deny`** — lists each blocker as `rule file:line` |
| fresh, `CRITICAL == 0` | `allow`, silently |

The hook is checked into git, so it reaches everyone whose branch descends from this
one. Three consequences the script must honor:

- **Absent stamp is `ask`, never `deny`.** A teammate who has never run this skill
  must still be able to push.
- **Fail open in every degraded state** — no `jq`, unreadable stamp, not a git repo,
  script error. A gate that breaks the push when the gate itself is broken gets
  deleted from the repo by the third person who hits it.
- **`--delete` passes through.** Deleting a remote branch publishes no code.
  `--dry-run` is *not* special-cased: it should preview the block it would hit.

Escape hatch: prefix the command with `DEVDIGEST_SKIP_SELFREVIEW=1`. There has to be a
documented way past a false positive that is not "delete the hook."

## Never

- Report a pre-existing violation in an untouched line as a finding of this diff.
- Block on an unverified CRITICAL, or on WARNING/SUGGESTION at any count.
- Invent a severity or verdict name outside the product's two enums.
- Dispatch a reference skill (`fastify-best-practices`, `drizzle-orm-patterns`,
  `next-best-practices`, `zod`, `typescript-expert`, `postgresql-table-design`,
  `mermaid-diagram`, `react-testing-library`) as a **reviewer** — they carry no
  violation catalog and no severity model, so they produce noise, not findings. They
  load as *context* for a matched reviewer only.
- Edit source before the user approves the findings.
- Write the stamp by hand-computing the hash instead of calling `--hash`.
