# Migration — where target ≠ current

[SKILL.md](SKILL.md) describes where the code is going. This file records the eight
places it deliberately is not there yet, and the order in which that is worth fixing.

**This is not an inventory of violations.** A file-by-file list rots within two commits
and then misleads, so what follows is named decisions plus commands to re-derive the
numbers.

## The touch-it-fix-it rule

40 of 46 component folders predate these rules. A big-bang migration is **not**
sanctioned and this skill must not generate one.

- **New folders are born compliant.** Full `C1`–`C16`, no exceptions.
- **Existing folders converge when a task opens them anyway.** Editing
  `RunHistory.tsx` for a feature? Extract its `styles.ts` in the same PR. Not touching
  it? Leave it.
- **Audits report the diff, not the repo.** A pre-existing violation in an untouched
  line is out of scope — see [SKILL.md](SKILL.md) audit mode step 4.

The two exceptions worth doing on purpose, because they are behavioural bugs rather
than style drift, are steps 1 and 2 below.

## The eight deltas

1. **`src/lib/query-keys.ts` does not exist.** 15 key literals live inline across five
   hook files, two of them also hand-written in `pulls/[number]/page.tsx:53,58`.
   → [query-keys.md](query-keys.md).
2. **Three mutations under-invalidate.** `useCancelRun` invalidates nothing,
   `useRunReview` only `reviews`, `useFindingAction` only when `prId` was passed. The
   page compensates with two closures threaded down as props. Behavioural.
3. **`src/lib/domain/` does not exist.** Its contents are currently scattered:
   `latestPerAgentRuns`/`severityTally`/`totalOf` in
   `src/components/severity-counts/helpers.ts`, `outcomeOf` inline at
   `RunHistory.tsx:25`, `tsOf` in two copies, `SEVERITY_ORDER` in two copies.
4. **`page.tsx` files hold logic.** Two of seven are thin (`agents/page.tsx`,
   `settings/[section]/page.tsx`, both 7 lines). The rest: 195, 135, 124, 49 lines.
5. **`RunHistory/` has no segments.** No `index.ts`, no `styles.ts`, no `constants.ts`,
   no `helpers.ts` — but it does have a 160-line test. Everything the convention wants
   extracted is inline: a business rule, three `CSSProperties` consts, a duplicated
   date helper, 14 inline styles.
6. **Severity maps are re-declared.** `SEV` (`vendor/ui/primitives/tokens.ts:6-14`) is
   canonical; `FindingCard/constants.ts:4-9` and `FindingsSection.tsx:12-16` are copies,
   and the second has already drifted (`SUGGESTION: var(--accent)`). A rendering bug
   that typechecks.
7. **Import paths are split.** 51 relative imports reach three or more levels up
   (worst: seven, `SettingsApiKeys.tsx:6`) against 29 `@/` — sometimes in the same
   import block.
8. **i18n gaps are systematic, not random.** `aria-label`, `title`, and error/empty
   state bodies bypass `useTranslations`; happy-path copy generally does not.
   `ReviewRunAccordion` and `AddRepoView` call `useTranslations` nowhere.

## Order of work — by unlock, not by size

1. **`query-keys.ts` + the invalidation matrix.** Fixes real staleness bugs, touches
   only `src/lib/hooks/*` plus the deletion of two closures in one page. Nearly zero
   churn, highest payoff. Run `pnpm test` — the existing component tests mock `fetch`,
   so cache-key changes surface there.
2. **Create `src/lib/domain/` and move four things into it** —
   `latestPerAgentRuns`/`severityTally`/`totalOf`, `tsOf` (deleting the duplicate),
   `SEVERITY_ORDER` (deleting the duplicate), `outcomeOf`. Each arrives with a
   `*.test.ts`. This deletes the tier-4→tier-3 domain-logic edge (delta 3 and 7's worst
   case at once) and lets `severity-counts/index.ts` shrink to the component.
3. **Thin `pulls/[number]/page.tsx`.** Depends on step 1 (the closures go away) and
   step 2 (`latestPerAgentRuns` moves). Extract `usePrDetailPage` into
   `_components/hooks/`.
4. **Give `RunHistory/` its segments.** Self-contained, already has a test to protect
   the refactor.
5. **Adopt `SEV` in the two copies.** Fixes the `var(--accent)` drift.
6. **Opportunistic only — `@/` paths, `styles.ts` extraction, i18n keys.** In files a
   task already opens. Never as a standalone sweep.

## Enforcement — a checklist, not a lint config

`client/` has **no ESLint at all**; the scripts are `dev`, `build`, `start`,
`typecheck`, `test`. So none of `C1`–`C16` is mechanically enforced, and this skill
functions as a review checklist.

Adding ESLint is deliberately **out of scope** here: it means `eslint` +
`eslint-config-next` + a config + a `lint` script + a CI step + a first run against 46
folders producing hundreds of findings unrelated to architecture. That is its own PR
with its own review, and folding it in would bury the architecture decision.
`onion-architecture` made the same call for the same repo
([its README](../onion-architecture/README.md) § Boundary-enforcement tooling) — two
skills should not disagree on a repo-wide fact.

If the team ever wants mechanical enforcement, `C1` is the one to start with: it is a
pure path rule, and `import/no-restricted-paths` with `zones` is exactly what
bulletproof-react uses for it. `import/no-cycle` would cover `C6`.

## Re-deriving the numbers

All counts above are **as of 2026-08-06**. Regenerate rather than trust them:

```bash
cd client

# component folders, and how many are fully compliant
find src/app src/components -name '*.tsx' \
  -not -name '*.test.tsx' -not -name 'page.tsx' -not -name 'layout.tsx' \
  | xargs -n1 dirname | sort -u | wc -l                      # 46
for d in $(find src/app src/components -name '*.tsx' -not -name '*.test.tsx' \
             | xargs -n1 dirname | sort -u); do
  [ -f "$d/styles.ts" ] && [ -f "$d/constants.ts" ] && [ -f "$d/helpers.ts" ] \
    && ls "$d"/*.test.tsx >/dev/null 2>&1 && echo "$d"
done | wc -l                                                  # 6

# segments present
find src/app src/components -name index.ts     | wc -l        # 46
find src/app src/components -name styles.ts    | wc -l        # 25
find src/app src/components -name constants.ts | wc -l        # 19
find src/app src/components -name helpers.ts   | wc -l        # 11
find src/app src/components -name '*.test.tsx' | wc -l        # 12

# C1 — the tier invariant. MUST be empty.
grep -rn 'from "[^"]*app/' src/components src/lib

# C8 — deep relative vs alias
grep -rEo 'from "(\.\./){3,}' --include='*.ts*' src | wc -l   # 51
grep -rEo 'from "@/' --include='*.ts*' src | wc -l            # 29

# C9 — inline styles in app code (excludes vendor)
grep -ro 'style={{' --include='*.tsx' src/app src/components src/lib | wc -l   # 93

# C15 — key literals outside the hooks directory. Target: empty.
grep -rn 'queryKey: \[' src/app src/components

# page sizes, thinnest first
find src/app -name 'page.tsx' | xargs wc -l | sort -n
```

`"use client"` currently covers 62 files against 3 real server components. That ratio
is a **decision**, not drift (`client/CLAUDE.md`: "The server is the source of truth;
the client only caches it"), and revisiting it belongs to `next-best-practices` — it is
not one of the eight deltas.
