# Agents

Project subagents. Each runs in its **own context window**: it sees its system prompt, the
task it was handed, the `CLAUDE.md` hierarchy and any preloaded skills — but never this
conversation's history. Only its final message comes back. That isolation is why every agent
here has an explicit output contract, and why the planner writes a file instead of trusting
a handoff.

Shared with the team via version control. The full rules live in each agent's own file; this
page is the map.

## Catalog

| Agent | Responsibility | Model | Writes? |
|-------|----------------|-------|---------|
| [planner](planner.md) | Turns a task into a Development Plan bound to layers, files and skills | opus | `docs/plans/` only |
| [implementer](implementer.md) | Executes an approved plan across `server/` and `client/`, runs the checks | opus | product code + tests |
| [test-writer](test-writer.md) | Writes and runs client + server + reviewer-core tests for a target | sonnet | test files only |
| [architecture-reviewer](architecture-reviewer.md) | Read-only audit of onion + client-tier + vendor/shared boundaries | opus | no |
| [plan-verifier](plan-verifier.md) | Read-only check of an implementation against every plan step + acceptance criterion | opus | no |
| [doc-writer](doc-writer.md) | Documents implemented features into `docs/**` with diagrams | sonnet | `docs/**` + `README.md` |
| [researcher](researcher.md) | Answers "how does X work here" / "what do the upstream docs say", with citations | sonnet | no |

**Security** review is **not** in this set — `planner`, `implementer`, `test-writer`,
`architecture-reviewer` and `plan-verifier` all hand security findings off rather than rule on
them. Architecture review now *is* in the set, via [architecture-reviewer](architecture-reviewer.md);
the other agents still defer architectural verdicts to it.

## Pipeline

```
task ──▶ planner ──▶ docs/plans/<date>-<slug>.md ──▶ you approve ──▶ implementer ──▶ report
             │                                                            │
             │                                          ┌─────────────────┼──────────────┐
             │                                          ▼                 ▼              ▼
             │                                     test-writer   architecture-reviewer  doc-writer
             │                                          │                 │              │
             │                                          └──▶ plan-verifier ◀── reads the plan + the code
             │
             └── researcher, on demand, from either side
```

The plan file is the handoff. Because `implementer` starts cold, anything the planner leaves
out of the file is lost — so `planner` writes for a reader who has never seen the task, and
`implementer` refuses to run without a plan path rather than inventing one. The four
post-implementation agents each read the same plan and the resulting code: `test-writer` adds
coverage, `architecture-reviewer` audits boundaries, `plan-verifier` checks the work against
every plan item, and `doc-writer` documents what shipped. They stay separate on purpose — one
responsibility each, so a read-only reviewer never holds a write tool.

---

## planner

**Responsibility.** Read the affected modules, each package's `INSIGHTS.md`, the `CLAUDE.md`
constraints and the governing skills; emit a step-by-step plan where every step names its
package, layer, files, the skill that governs it, and a checkable "done when".

**Permissions**

| | |
|---|---|
| Tools | `Read`, `Grep`, `Glob`, `Bash`, `WebSearch`, `WebFetch`, `Write`, `Skill`, `TodoWrite` |
| Write scope | **exactly** `docs/plans/<YYYY-MM-DD>-<slug>.md` — any other path is refused |
| Bash | observation only (`git log`/`diff`/`blame`, `rg`, `ls`, `gh … view`) |
| Never | product code, `pnpm db:migrate`, `db:seed`, `install`, `git commit`/`push`, `gh pr create` |
| Model | `opus` |

**In** — a task statement. If it is only a topic, has no acceptance condition, spans packages
without a boundary, names an entity that does not resolve, or contradicts a hard constraint,
the agent returns numbered questions with defaults and stops.

**Out** — `docs/plans/<date>-<slug>.md` with eight fixed sections: scope · affected surface ·
constraints in force · skill contract · steps · test strategy · risks & open questions ·
acceptance criteria. The final message is a summary plus the file path, not the plan text.

**Sources its rules rest on**

| Rule | Source |
|---|---|
| Write-scope confinement, plan-as-artifact handoff | subagent context isolation — [code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents) |
| Read-only planning agent, single responsibility, `description` drives delegation | same |
| Onion inward-only · client tier order · `vendor/shared` source of truth · new-migration-only · secrets via `SecretsProvider` · empty-table caveat | root [CLAUDE.md](../../CLAUDE.md), `server/CLAUDE.md`, `client/CLAUDE.md` |
| `*.it.test.ts` split, per-lane commands in section 6 | [TESTING.md](../../TESTING.md) |
| `INSIGHTS.md` append-only, entry format, promotion rule | [engineering-insights](../skills/engineering-insights/SKILL.md) |
| Layer rules quoted into section 3 | [onion-architecture](../skills/onion-architecture/SKILL.md), [client-architecture](../skills/client-architecture/SKILL.md) |
| End-to-end data flow, package topology | [docs/architecture.md](../../docs/architecture.md) |
| Report shape, "ask first" gate, citation discipline | [researcher.md](researcher.md) — the pre-existing house convention |

---

## implementer

**Responsibility.** Execute the plan. Apply the skill that governs each file before editing
it, run the checks the plan names, report verbatim output. Self-verification is bounded to
*did I do what the plan said, and are the checks green*.

**Permissions**

| | |
|---|---|
| Tools | `Read`, `Edit`, `Write`, `Grep`, `Glob`, `Bash`, `Skill`, `TodoWrite` |
| Denied | `WebSearch` — library decisions belong to the planner |
| Write scope | `server/src/**`, `client/src/**`, `reviewer-core/src/**`, tests, **new** migrations |
| Never touches | applied migrations · `*/vendor/shared/` as client-side origin · `client/src/vendor/ui/` · existing `INSIGHTS.md` entries |
| Bash allowed | `pnpm test`/`typecheck`/`db:generate`/`db:migrate`, `npm test`, `vitest`, read-only git |
| Bash refused | `git commit`, `git push`, `gh pr create`/`merge`, `db:seed` on a non-empty DB, `install` unless planned |
| Model | `opus` |

**In** — a path to `docs/plans/*.md`. Without one it stops and asks; it does not reconstruct
a plan from the task description.

**Out** — a report with five fixed sections: done (per step, with `path:line`) · deviations ·
verification (verbatim command output; a skipped check is reported as skipped, never as
passed) · **outside my verification** (architecture and security observations, handed off,
not fixed and not judged) · `INSIGHTS.md` candidates.

**Sources its rules rest on**

| Rule | Source |
|---|---|
| Skill preloading, tool/`disallowedTools` semantics, dense return value | [code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents) |
| One agent = one responsibility → no architecture/security verdict here | same |
| Package-manager split (pnpm vs npm), test lanes, typecheck commands | [TESTING.md](../../TESTING.md) + each package's `package.json` |
| `*.it.test.ts` suffix is load-bearing for the CI split | [TESTING.md](../../TESTING.md) |
| Ring map, `routes`/`service`/`repository` separation, `reviewer-core` zero-I/O | [onion-architecture](../skills/onion-architecture/SKILL.md), `server/CLAUDE.md` |
| Five client tiers, `api.ts` / `hooks/*` / `query-keys.ts` funnels | [client-architecture](../skills/client-architecture/SKILL.md), `client/CLAUDE.md` |
| Contract source of truth and the manual re-sync step | root [CLAUDE.md](../../CLAUDE.md) |
| Pre-report self-check | [pr-self-review](../skills/pr-self-review/SKILL.md) |
| Insight entry format, append-only discipline | [engineering-insights](../skills/engineering-insights/SKILL.md) |

---

## researcher

**Responsibility.** Read-only investigation in two modes — inside this repo, and external
sources — under one contract: no claim without a citation, no silent gaps.

**Permissions** — `Read`, `Grep`, `Glob`, `Bash`, `WebSearch`, `WebFetch`. No `Write`, no
`Edit`; Bash is observation only. Model `sonnet`.

**In** — a question answerable in one line. Ambiguous scope, unstated deliverable, or an
unresolvable entity → numbered questions with defaults, and it stops.

**Out** — a report in the mode's fixed shape (question · conclusions · sources/evidence ·
confidence · **not found**). The `## Not found` section is mandatory and never omitted.

---

## test-writer

**Responsibility.** Write tests for a target across client, server and reviewer-core, apply
the skill that governs each surface, run them, and report pass/fail. It never edits product
code to force a pass.

**Permissions**

| | |
|---|---|
| Tools | `Read`, `Edit`, `Write`, `Grep`, `Glob`, `Bash`, `Skill`, `TodoWrite` |
| Write scope | test files only — `*.test.tsx`, `*.test.ts`, `*.it.test.ts`, fixtures |
| Bash | vitest / typecheck per package + read-only git |
| Never | product source, migrations, `vendor/shared`, `git commit`/`push` |
| Model | `sonnet` |

**In** — a target to test (component/route/module path or a plan step) plus a base ref for
"what changed". Unresolvable target → asks and stops.

**Out** — tests written · verification (verbatim output, per-lane pass/skip) · could-not-test ·
handoff (product-code bug found, described not fixed). A DB-backed test lands in the
`*.it.test.ts` lane; a skipped lane is reported as skipped, never passed.

**Sources its rules rest on**

| Rule | Source |
|---|---|
| Tool allowlist, isolated-context return value | [sub-agents docs](https://code.claude.com/docs/en/sub-agents) |
| `*.it.test.ts` split, per-lane commands, pnpm/npm split | [TESTING.md](../../TESTING.md) + each `package.json` |
| RTL query priority, `userEvent`, async patterns | [react-testing-library](../skills/react-testing-library/SKILL.md) |
| Server/reviewer-core test seams, zero-I/O invariant | [onion-architecture](../skills/onion-architecture/SKILL.md), [fastify-best-practices](../skills/fastify-best-practices/SKILL.md), [drizzle-orm-patterns](../skills/drizzle-orm-patterns/SKILL.md) |
| "Report failures as failures", never edit product code | [implementer.md](implementer.md) |

---

## architecture-reviewer

**Responsibility.** Read-only audit of architectural boundaries — onion inward-only layering,
client five-tier downward-only imports, `vendor/shared` source-of-truth. Rules on architecture
**only**.

**Permissions**

| | |
|---|---|
| Tools | `Read`, `Grep`, `Glob`, `Bash` — **no `Write`, no `Edit`** |
| Bash | observation only (`git diff`/`log`/`blame`, `rg`, `ls`) |
| Model | `opus` |
| Skills | `onion-architecture`, `client-architecture` — its whole job, nothing wider |

**In** — a diff (branch mode, changed lines only) or a named module (module mode). Neither
resolvable → asks and stops.

**Out** — scope · findings (each with `path:line` evidence + `CRITICAL`/`WARNING`/`SUGGESTION`
severity) · clean ("No violations found in X — searched Y") · out-of-scope (security /
correctness noticed but not judged).

**Sources its rules rest on**

| Rule | Source |
|---|---|
| Read-only reviewer = omit Write/Edit; single responsibility | [sub-agents docs](https://code.claude.com/docs/en/sub-agents) |
| Ring map `O1`–`O9`, audit mode, changed-lines guard | [onion-architecture](../skills/onion-architecture/SKILL.md), `server/CLAUDE.md`, `reviewer-core/CLAUDE.md` |
| Five tiers `C1`–`C16`, import direction, funnels | [client-architecture](../skills/client-architecture/SKILL.md), `client/CLAUDE.md` |
| `vendor/shared` source-of-truth | root [CLAUDE.md](../../CLAUDE.md) |
| Evidence + "searched Y" discipline, severity vocabulary | [researcher.md](researcher.md), [pr-self-review](../skills/pr-self-review/SKILL.md) |

---

## plan-verifier

**Responsibility.** Check an implementation against a specific Development Plan — every §5 step
and every §8 acceptance criterion, item by item, each with evidence or a command result. It
verifies concrete plan items and never substitutes generic advice.

**Permissions**

| | |
|---|---|
| Tools | `Read`, `Grep`, `Glob`, `Bash` — **no `Write`, no `Edit`** |
| Bash | observation **plus** exactly the commands the plan §6 names (to confirm "green") |
| Model | `opus` |
| Skills | **none** — preloading generic skills would invite the generic-advice failure it must avoid |

**In** — a path to `docs/plans/*.md` **and** the code (working tree / diff). No plan path →
stops and asks; it does not reconstruct a plan.

**Out** — step verdicts · acceptance-criteria verdicts (each `met` / `partial` / `not met` with
evidence) · command results (verbatim) · not-verifiable (item + why). An un-run command is
"not verified", never `met`.

**Sources its rules rest on**

| Rule | Source |
|---|---|
| Read-only, minimal tools, isolated return value | [sub-agents docs](https://code.claude.com/docs/en/sub-agents) |
| Verify concrete criteria, don't drift to generic advice | [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) (evaluator pattern); [/verify skill](https://code.claude.com/docs/en/skills) |
| "No plan, stop and ask"; report un-run commands honestly | [implementer.md](implementer.md) |
| Plan §5/§8 structure it checks against | [planner.md](planner.md) |

---

## doc-writer

**Responsibility.** Document implemented features into the right `docs/` section with diagrams,
grounding every signature in real source. It documents only what shipped.

**Permissions**

| | |
|---|---|
| Tools | `Read`, `Edit`, `Write`, `Grep`, `Glob`, `Bash`, `Skill`, `TodoWrite` |
| Write scope | `docs/**` and each package's `README.md` |
| Never | product code, `vendor/shared`, migrations, and **`INSIGHTS.md` by hand** (route via `engineering-insights`) |
| Model | `sonnet` |
| Skills | `mermaid-diagram`, `typescript-expert`, `engineering-insights` |

**In** — an implemented feature (shipped/working diff, or a plan marked done) plus what to
document. Not-yet-shipped → stops and says so.

**Out** — docs written (file · section) · diagrams · routing decisions · not-documented. Routes
by kind: data flow → `docs/architecture.md`, DB detail → `server/docs/db-model.md`, jobs →
`server/docs/jobs-and-runs.md`, reviewer prompts → `docs/agent-prompts/`, package internals →
that package's `README.md`.

**Sources its rules rest on**

| Rule | Source |
|---|---|
| Write scope, isolated return value | [sub-agents docs](https://code.claude.com/docs/en/sub-agents) |
| Doc routing targets | [docs/architecture.md](../../docs/architecture.md), `server/docs/db-model.md`, `server/docs/jobs-and-runs.md`, [docs/agent-prompts/README.md](../../docs/agent-prompts/README.md) |
| Diagrams | [mermaid-diagram](../skills/mermaid-diagram/SKILL.md) |
| Accurate signatures from source | [typescript-expert](../skills/typescript-expert/SKILL.md) |
| `INSIGHTS.md` append-only, skill-only | [engineering-insights](../skills/engineering-insights/SKILL.md), root [CLAUDE.md](../../CLAUDE.md) |

---

## The shared skill set

`planner` and `implementer` preload the **same fourteen project skills** via the `skills:`
frontmatter field, which injects each skill's full `SKILL.md` at startup:

`onion-architecture` · `client-architecture` · `fastify-best-practices` ·
`next-best-practices` · `react-best-practices` · `react-testing-library` ·
`drizzle-orm-patterns` · `postgresql-table-design` · `typescript-expert` · `zod` ·
`security` · `pr-self-review` · `engineering-insights` · `mermaid-diagram`

Identical on both sides on purpose: the planner is bound by the exact rules that will bind
the implementer, so a plan cannot ask for something the implementation rules forbid. Both
files carry the same **skill-routing table** keyed by file path — it builds section 4 of the
plan, and it tells the implementer what to invoke before editing.

Cost: roughly 27k tokens of preload per agent run. Sub-files (`examples.md`,
`references.md`) load only on demand — that is progressive disclosure doing its job. If the
preload ever becomes too expensive, drop the `skills:` block; the routing table still works
and skills load at runtime through the `Skill` tool.

The four post-implementation agents preload **scoped** subsets, not the shared fourteen —
each file lists its own set, sized to its job: `test-writer` ten, `doc-writer` three,
`architecture-reviewer` two. `plan-verifier` and `researcher` preload **nothing** on purpose —
the verifier so generic best-practice skills can't pull it off the plan's concrete items, the
researcher so it stays unopinionated about this project's conventions.

## Frontmatter reference

Fields used here, all officially documented in
[code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents):

| Field | Meaning |
|---|---|
| `name` | lowercase + hyphens; the `agent_type` hooks receive |
| `description` | drives automatic delegation — state the trigger *and* what the agent is not for |
| `tools` | allowlist; omit to inherit everything |
| `disallowedTools` | denylist, subtracted after `tools` |
| `model` | `haiku` / `sonnet` / `opus` / a model id / `inherit` (default) |
| `color` | badge colour in the task list |
| `skills` | skill names preloaded in full at startup |

Also available and unused here: `permissionMode`, `maxTurns`, `memory`, `mcpServers`,
`hooks`, `isolation`, `background`, `effort`, `initialPrompt`.

## Adding an agent

1. One responsibility. If the description needs an "and", it is two agents.
2. Say what it is **not** for in the `description` — that is what stops bad delegation.
3. Grant the narrowest `tools` that still lets it finish.
4. Give it a fixed output format. Only the final message survives, so its shape is the API.
5. Add a row to the catalog above and a section with sources.
