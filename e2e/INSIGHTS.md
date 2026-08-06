# Insights — e2e

Append-only log of things this package **could not have told you** — what a
failed command, a surprise, a correction, or a rejected alternative cost us. If
reading the source plus `CLAUDE.md` would have produced it, it does not belong
here. Add to the matching section, newest first within it. A learning about
`scripts/`, Docker, or CI belongs to the package whose work it blocked.

**History, not rules** — dated notes under human spot-check, not verified docs. When an
entry hardens into a rule, promote one line into `CLAUDE.md` **Gotchas** and mark the
entry `→ promoted`; the full story stays here. Trust `CLAUDE.md` over an old entry.

Written by the `engineering-insights` skill, which reads this file to avoid repeating
itself, then appends. Read it when you start work in this package.

Never rewrite, reorder, or delete an existing entry. The one permitted edit is
appending `→ promoted to CLAUDE.md` when an entry hardens into a `CLAUDE.md`
**Gotchas** bullet.

Entry form: `- YYYY-MM-DD — finding → what to do (path:line)`. Full rules —
sections, dedup, promotion, prune thresholds — live in
`.claude/skills/engineering-insights/SKILL.md`.

## What Works

<!-- approaches that worked here and are worth repeating -->

_None yet._

## What Doesn't Work

<!-- tried and abandoned, and why — the most valuable section, and the one most often skipped -->

- 2026-08-06 — `click "<css-selector>"` exits **0 with `✓ Done` on an element it did not actually activate**: three consecutive clicks on an accordion header 1520px down the page (measured `getBoundingClientRect().y`) changed no state, and the same selector worked on the first try straight after `eval "…scrollIntoView({block:'center'})"`. Exit 0 means this can never fail a flow step — it silently asserts nothing → scroll before clicking anything below the fold, and assert the *consequence* (`wait --text`) rather than trusting the click's exit code. Observed with a raw CSS selector during manual verification, NOT with the `find role button click --name` form the flows use (that one worked on the same page), so treat `find … click` as the safer spelling
- 2026-08-05 — `wait --no-text` does not exist; asserting that text is *gone* has no flag (`agent-browser wait --help` lists only `--url --load --fn --text --download`), and an invented flag fails with a bare `Command failed: agent-browser wait --no-text …` that reads like the assertion timing out → use the documented form `wait --fn "!document.body.innerText.includes('…')"`, or `wait <selector> --state hidden` for an element (`e2e/specs/04-pr-findings.flow.json:18`)

## Codebase Patterns

<!-- conventions and architecture that are not obvious from reading the code -->

_None yet._

## Tool & Library Notes

<!-- version constraints and quirks of deps and the toolchain -->

_None yet._

## Recurring Errors & Fixes

<!-- Symptom / Cause / Fix blocks, newest first -->

### 2026-08-05 — `wait --text` on a column header fails against the i18n string

**Symptom:** one step failed while the same text was plainly on screen:

```
✗ the FINDINGS column header renders — Command failed: agent-browser wait --text Findings
```

**Cause:** `--text` matches **rendered** text, and `innerText` reflects the computed
`text-transform`. The PR-list header row sets `textTransform: "uppercase"`
(`client/src/app/repos/[repoId]/pulls/styles.ts:106`), so the DOM string is
`FINDINGS` even though the i18n value is `"Findings"`
(`client/messages/en/prReview.json:107`). Copying the assertion out of the message
JSON is the natural move and is exactly what breaks. Verified in the browser:
`innerText.includes('FINDINGS')` → `true`, `includes('Findings')` → `false`.

**Fix:** assert `"FINDINGS"`. Before writing any header assertion, check the
surrounding style for `textTransform` — the whole PR-list header row and every
`SeverityBadge` label are uppercased this way, so this recurs for any column name
or badge, not just this one.

### 2026-08-05 — `sh: tsx: command not found` after the hermetic stack booted cleanly

**Symptom:** `./scripts/e2e.sh` brought Postgres up, applied migrations, seeded,
started the API and web, printed `▸ running e2e flows`, then:

```
> @devdigest/e2e@0.0.0 test
> tsx run.ts
sh: tsx: command not found
▸ tearing down hermetic e2e stack
```

**Cause:** `e2e/node_modules` had never been installed in this checkout — `tsx` is a
devDependency of this package (`e2e/package.json`), and no other package's install
provides it because the four packages are standalone, not a workspace. The error
names `tsx` rather than the missing install, and it arrives *after* ~30s of
successful stack setup, so it reads like a toolchain problem in the runner.

**Fix:** `cd e2e && npm install` (npm here, not pnpm — see the root `CLAUDE.md`
table). The browser driver is a *separate* prerequisite and is not in
`package.json` at all: `npm i -g agent-browser && agent-browser install`, the
second step downloading ~178MB of Chrome for Testing. `scripts/e2e.sh` warns
`! agent-browser not found` and then proceeds to build the whole stack anyway, so
that warning is easy to scroll past — read it as fatal.

## Session Notes

<!-- dated one-liners: what a session changed, and what it cost to find out -->

_None yet._

## Open Questions

<!-- unresolved, each with what would settle it -->

_None yet._
