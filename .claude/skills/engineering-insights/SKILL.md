---
name: engineering-insights
description: Records a non-obvious engineering learning as one dated entry in the append-only INSIGHTS.md of the package a task touched — what failed, what was abandoned, and what the surprise cost. Use it the moment something non-obvious happens (a command fails for a reason its own output misnames, a plausible approach is tried and abandoned, a version or config constraint bites, a convention turns out to be undiscoverable from the source) and again as a wrap-up pass at the end of any substantive task involving a problem, a decision, or a discovery. Also use when the user asks to log, capture, promote, or review insights or learnings. It does not record anything a reader of the code plus CLAUDE.md would already know, and it never renames the journal — the file is always INSIGHTS.md.
user-invocable: true
---

# Engineering insights — append-only cross-session memory

One entry per non-obvious learning, in the `INSIGHTS.md` of the package the task
touched. A session that surprised no one writes nothing — signal over volume.

## Does it earn an entry?

**If a reader of the source plus that package's `CLAUDE.md` would arrive at it, it does
not.** Earns one: a command that failed for a reason its own output misnamed, an
approach tried and abandoned, a version or config constraint, a convention with no
trace in the code, a cost actually measured. Earns nothing: restating code, generic
advice, a trivial config edit, anything already in `CLAUDE.md` **Gotchas**.

Write it for a stranger six months from now who has your symptom and none of your
context. Zero entries is a correct outcome.

## Which file

| The fix lands in | Target |
|---|---|
| `server/` | `server/INSIGHTS.md` |
| `client/` | `client/INSIGHTS.md` |
| `reviewer-core/` | `reviewer-core/INSIGHTS.md` |
| `e2e/` | `e2e/INSIGHTS.md` |

These four are the only journals. One learning, one file — keyed on where the **fix**
lands, not where the symptom showed up: a client type error whose cause is a server
contract is a `server/` entry. A learning about `scripts/`, Docker, or CI goes to the
package whose work it blocked; if it blocked all of them it is a `CLAUDE.md` **Gotchas**
bullet, not an entry.

## Procedure

1. **Verify.** Re-read the `path:line` you are about to cite and confirm the claim holds
   now. An unverified claim is not an entry.
2. **Read the target file** end to end. Its entries are both the dedup set and the answer
   to "has a past session already paid for this".
3. **Dedup on mechanism, not wording.** Already logged → append nothing, and say so. A
   narrower special case of a logged mechanism → append, citing the earlier date. An old
   entry now wrong → append a new dated entry that names the date it corrects and why;
   never edit the old one.
4. **Pick exactly one section** (see below). Check **What Doesn't Work** first — highest
   value, most often skipped.
5. **Append** newest-first inside that section, editing only lines inside that one
   section. Drop the section's `_None yet._` when it becomes the first entry. Never
   reflow the preamble or a neighbouring section.
6. **Report** in one line: what was written, where, in which section — or that nothing
   was worth writing.

## Entry grammar

Six sections take a one-liner. Today's real date, ISO, em-dash separated:

```
- YYYY-MM-DD — mechanism → what to do (path:line)
```

*mechanism* is the cause, not the symptom. *what to do* is imperative and actionable.
Evidence is `path:line`, or the exact command when the finding is about a command.

**Recurring Errors & Fixes** takes a block instead, newest first:

```markdown
### YYYY-MM-DD — short title
**Symptom:** what was observed, verbatim where useful.
**Cause:** the actual mechanism, not the guess.
**Fix:** what changed, with file paths.
```

## The seven sections

Pick the first row that fits — ties resolve upward, toward the sections that get skipped.

| Section | Take it when |
|---|---|
| **What Doesn't Work** | Something was tried and abandoned, or a plausible approach is a dead end. Checked first, always. |
| **Recurring Errors & Fixes** | A concrete error message with a known cause and cure — someone will paste that string into a search box again. |
| **Tool & Library Notes** | The cause lives in a dependency, a version, a lockfile, or the toolchain (pnpm, tsx, vitest, drizzle-kit, agent-browser). |
| **Codebase Patterns** | A convention or architectural constraint that reading the code does not reveal. |
| **What Works** | A confirmed approach worth deliberately repeating — not "it compiled". |
| **Open Questions** | Unresolved. Must carry what would settle it. |
| **Session Notes** | Nothing above fits and it is still worth a dated one-liner. The residual bucket, never a first choice. |

**`Session Notes` is where a journal goes to die.** It is the section a model dumps into
when it wants to feel productive, and a file of dated one-liners is a changelog, not
memory. If an entry lands there, try the six rows above once more.

## Vague vs useful

| Don't | Do |
|---|---|
| `- 2026-08-05 — promises can be tricky` | `- 2026-08-05 — Promise.all() on the ingest pipeline times out past 30 items → use Promise.allSettled() in batches of 10 (src/ingest/pipeline.ts:88)` |
| `- 2026-08-03 — pnpm had an install error` | `- 2026-08-03 — pnpm ≥11 runs its deps check before the script, so an install failure surfaces under whatever command triggered it → read past the "applying migrations" label to the real ERR_PNPM_IGNORED_BUILDS (server/pnpm-workspace.yaml)` |
| `- 2026-08-05 — watch out for the vendor folder` | `- 2026-08-05 — client/src/vendor/shared/ is a hand-synced copy and TypeScript never flags the drift → fix server/src/vendor/shared/ first, then re-sync by hand (client/src/vendor/shared/index.ts:1)` |
| `- 2026-08-05 — don't edit files while the server runs` | `- 2026-08-05 — a tsx watch restart runs reapStaleRuns, which marks every status='running' row failed → never save a server file mid-review (server/src/app.ts)` |
| `- 2026-08-05 — tests are flaky` | `- 2026-08-05 — flows 02/04/05 follow the home redirect to the first repo, so a dev DB with several repos fails them → run ../scripts/e2e.sh for a freshly-seeded DB (e2e/specs/02-repos.flow.json)` |

The left column fails one test each: no mechanism, no action, no evidence. Also do not
write: entries that restate a diff, entries with no `path:line`, entries whose "what to
do" is "be careful", or a dependency quirk filed under Session Notes.

## Promotion

An entry that has held across sessions becomes a rule: add ONE bullet to that package's
`CLAUDE.md` **Gotchas** and append `→ promoted to CLAUDE.md` to the entry. That suffix is
the only permitted edit to an existing entry. Promote when it holds across ≥2 sessions,
states as a rule in one line, and has a cheap check.

## Hygiene

- **Soft ceiling ~200 entries or ~600 lines per file.** Past it signal/noise falls — a
  human splits by domain into `<pkg>/docs/insights/<domain>.md` and leaves a pointer.
- **Monthly pass:** promote what hardened, mark obsolete entries with a *new* dated
  entry. Never delete. A stale note about a since-upgraded library is worse than none.
- **Contradictions get resolved explicitly**, never left for a future session to pick
  between at random.
- **This is dated history under human spot-check, not verified docs.** `CLAUDE.md`
  outranks any entry. Every entry must be independently checkable from its `path:line`.

## Never

- Rewrite, reorder, delete, or reflow an existing entry — or the file's preamble.
- Invent a journal. The name is `INSIGHTS.md`, never `LEARNINGS.md` or `NOTES.md`, and
  never a new journal in a fifth location — there are exactly four.
- Append to a file missing the seven sections — stop and report.
