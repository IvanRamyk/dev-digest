# Severity — four scales in, three tiers out

Each reviewer speaks its own dialect: the architecture skills call every rule a "hard
rule" with no tiers, `react-best-practices` tags sections `CRITICAL`/`HIGH`/`MEDIUM`,
`security` runs `CRITICAL`/`HIGH`/`MEDIUM`/`LOW` behind a confidence gate. This file
is the single place they collapse into the product's
`CRITICAL` / `WARNING` / `SUGGESTION`.

Normalize **here**, in one pass, after all reviewers return — never inside a reviewer.
Four skills mapping their own severity is four chances to disagree about what blocks a
push.

## The principle

> **CRITICAL is reserved for breaches of import direction and layer boundaries, plus
> anything already CRITICAL upstream.** Those are the violations that compound: once a
> tier or a ring is crossed, every later change inherits the crossing, and the cost of
> undoing it grows with the diff. A misplaced `styles.ts` costs a rename.

Everything else is a review comment, not a locked door.

## → CRITICAL (blocks the push)

### client-architecture

| Rule | Blocks when |
|---|---|
| `C1` imports point downward only | any upward or lateral import — `src/components/**` or `src/lib/**` importing `src/app/**`, or a route importing a sibling route's `_components/` |
| `C5` `index.ts` is the folder's public API | an outside caller reaches past the barrel into a folder's internals |
| `C8` `@/` leaves the folder, relative stays inside | a relative import crosses out of its folder, or `@/` is used inside one |
| `C14` one network path, one hook home | `fetch` outside `src/lib/api.ts`, or a data hook defined outside `src/lib/hooks/` |

### onion-architecture

| Rule | Blocks when |
|---|---|
| `O1` the core stays pure | `reviewer-core/src/**` gains `node:fs`, `drizzle-orm`, `fastify`, or `process.env` — **zero tolerance, this is the package's reason to exist** |
| `O2` ports are declared inward | a new external call is made without a port in `vendor/shared/adapters.ts` |
| `O4` `service.ts` holds no HTTP and no SQL | a service imports `fastify` or `drizzle-orm` |
| `O5` `routes.ts` is transport only | a route holds a query, a GitHub call, or an aggregate reduction |
| `O6` `repository.ts` is a module's only drizzle site | drizzle appears anywhere else in the module |
| `O7` modules do not import each other's data layer | a cross-module `repository.ts` import |
| `O8` parse once, at the edge | **only** when unvalidated external input reaches a service. Redundant *re*-parsing at an inner ring is WARNING — it is waste, not a hole. |

### react-best-practices

Its own `CRITICAL` sections map straight through — "will cause bugs, broken
reconciliation, or maintenance nightmares" (`SKILL.md:36`): **Component Design**,
**Derive Don't Store**, **Render Factories**, **Over-Engineering**, **Key Prop
Patterns**.

Two carve-outs, because this repo overrode those rules:

- **Over-Engineering** — its "container components fetch data" advice is superseded by
  hooks (`client-architecture/SKILL.md:55-58`). Do not block on the absence of a
  container.
- **Tailwind CSS (MEDIUM)** never blocks; it is superseded outright — app code uses
  `styles.ts`, not utility classes.

### security

Its own `CRITICAL` — "direct exploit, no auth required" (`SKILL.md:255`) — **and only
at HIGH confidence** (`SKILL.md:18`: vulnerable pattern *plus* attacker-controlled
input confirmed). MEDIUM confidence is a note, never a block.

Repo-specific CRITICAL: an API key reaching the DB, a log line, a response body, or
git. Keys live in `~/.devdigest/secrets.json` at mode `0600`, read only through
`SecretsProvider`.

## → WARNING (verdict `comment`, never blocks)

- Every other `C*` breach: `C2` placement · `C3` fat `page.tsx` · `C4` missing folder
  segment · `C6` sibling imports · `C7` barrel over-export · `C12` promotion rule ·
  `C13` duplicated token map · `C15` hand-written query key or misplaced
  `invalidateQueries` · `C16` poll that does not self-quench
- `O3` port without a double/override · `O9` multi-write without a transaction ·
  `O8` when it is redundant re-parsing rather than a missing parse
- `react-best-practices` `HIGH`
- `security` `HIGH` and `MEDIUM` at HIGH confidence

`C15` deserves a note: it is the most common finding in this repo and it is genuinely
worth fixing, but a hand-written query key does not cross a layer — it is a
correctness risk inside one, and a stale cache is visible in a way a broken ring is
not.

## → SUGGESTION

- `C9` `styles.ts` shape · `C10` no user-visible string in `constants.ts` ·
  `C11` `helpers.ts` purity
- `react-best-practices` `MEDIUM`
- `security` `LOW` — but its own gate says do not report LOW at all, so this bucket
  should normally be empty from that reviewer

## Dedupe

Key on `file:line + rule`. Same line, two reviewers → keep the higher severity and
cite both ids: `[C1][react:Component Design]`. Never let one underlying defect appear
twice in the tally — the CRITICAL count is what the hook reads, and double-counting
inflates a block.

## When a rule is not in this file

Default to **WARNING** and say so in the report. A reviewer inventing a new blocker is
worse than a missed block: the miss costs one review comment, the invention costs a
developer their push and this gate its credibility.
