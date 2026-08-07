# Skills for review agents

Reusable, editable markdown rule-blocks that agents pull into their prompt — and the
one missing edge that makes them reach the model.

## Context

Agents today carry one hand-written `system_prompt` each. Rules that apply to several
agents (test-quality heuristics, API-contract rules, house conventions) have to be
copy-pasted into every prompt and drift immediately. Skills fix that: one body of
markdown, edited in one place, bound to N agents, injected as an ordered block.

Most of the feature already existed and was inert: `skills` + `skill_versions` tables
(`server/src/db/schema/skills.ts`), the `agent_skills` link table with `order`
(`server/src/db/schema/agents.ts`), the `Skill` / `AgentSkillLink` Zod contracts, the
agent-side link/reorder repo + service + routes, the `PromptParts.skills` →
`## Skills / rules` prompt section, the `PromptAssembly.skills` trace field, and the
trace drawer's renderer for it. The single functional gap was
`server/src/modules/reviews/run-executor.ts` calling `reviewPullRequest(...)` without a
`skills` key — the block was always absent and `prompt_assembly.skills` was always
`null`.

## Decision

### Editor tabs: Config · Preview · Versions

Stats and Evals are cut. Stats needs finding→skill attribution that does not exist;
Evals needs `eval_cases` / `eval_runs`, which are empty L-later placeholders.

### Import accepts `.md` *and* `.zip`

The zip path is what visibly demonstrates "executable parts are not processed": every
non-markdown entry is listed in the preview as skipped, and nothing is written to disk
or executed. Transport is JSON (`{ filename, content_base64 }`), not multipart — this
keeps the single network path in `client/src/lib/api.ts` and lets the zod type
provider validate the body. The global 1 MB `bodyLimit` (`server/src/app.ts`) stays
untouched everywhere else; the two import routes override it per-route to 4 MB.

Archive guards, enforced before any entry is handed to extraction:

| Guard | Rule |
|---|---|
| entry count | ≤ 200, else `archive_too_many_entries` |
| single entry uncompressed | ≤ 1 MB |
| total uncompressed | ≤ 2 MB, else `archive_too_large` (decompression bomb) |
| path shape | reject `..`, a leading `/`, backslashes, `:` — zip-slip, even though we never write |
| body selection | `SKILL.md` at any depth wins; else the shallowest `*.md`; else `empty_skill_body` |
| every other entry | returned as `{ path, bytes, reason: 'not_processed' }` (or `'unsafe_path'`) |

### The agent Skills-tab checkbox means *linked*, not *enabled*

No migration on `agent_skills`. Unchecking deletes the link row and drops that skill's
position in the order — deliberate, see Consequences.

### Two new agents ship via seed + a spec doc

No e2e flow. The requirement that at least one skill arrives by import is satisfied
by hand in the UI (see the control experiment below), not by the seed.

### Imported content is untrusted; manual content is not

Two security behaviours carried into the new module:

- imported skills land **`enabled: false`** — a vetting gate, so a stranger's skill
  can never reach a prompt on the strength of an upload alone.
- the stored body is wrapped: `wrapUntrusted(\`imported:${source}\`, raw.trim())`
  (`reviewer-core/src/prompt.ts`, re-exported by `server/src/platform/prompt.ts`).
  Manually authored skills go in raw as instructions — that is the whole point of a
  skill: to be an instruction, not data. `assemblePrompt` therefore needs no trust
  model of its own; the wrapping happened at import time.

### Zero skills ⇒ byte-identical prompt

`run-executor.ts` builds the skill bodies with `buildSkillBodies(agentId)`, filters to
`skill.enabled` (the `linkedSkills` join does not filter this itself — filtering is
this call's job), and spreads the result into `reviewPullRequest` only when non-empty:
`...(skills.length ? { skills } : {})`. A broken skill lookup degrades to `[]` and logs
a Live Log line — it must never fail the run. `prompt.ts` needed no change: the
section, the join, and the trace field already existed.

## Consequences, stated deliberately

- **Unchecking a skill on the agent Skills tab unlinks it and loses its order
  position.** Decision 3 declines an `agent_skills.enabled` column, so "bound but
  muted for this one agent" is not expressible. "An enabled skill appears in the logs
  as a separate block, a disabled one does not" is satisfied through the skill's own
  global `skills.enabled` toggle in Skills Lab, which the executor filters on. Revisit
  only if per-agent muting is actually asked for; it is one migration plus one field in
  `AgentVersionConfig`.
- **Reordering is buttons, not drag.** The client has no DnD library and this feature
  does not add one. The persisted contract (`POST /agents/:id/skills { skill_ids }`) is
  identical either way, so swapping in drag later touches one component.
- **Token counts are client-side approximations** (`length / 4`), not tiktoken. The
  real tokenizer is a server adapter scoped to `modules/repo-intel`; exposing it would
  mean extending `PromptAssembly` inside `*/vendor/shared/`. The number is a size cue,
  not a billing figure.
- **Skill bodies are injected as instructions, not data, unless imported.** That is
  the trust boundary, and it is the whole reason imports land disabled: someone else's
  skill is someone else's instructions inside your agent's prompt.
- `run-executor.ts`'s failure-path assembly still omits `callers` / `repo_map` /
  `pr_description`, and `TraceBody.tsx` still never renders `pr_description`. Both are
  pre-existing and out of scope here.

## Control experiment

Run this manually against `./scripts/dev.sh` (auto-invoke of `/pr-self-review` stays
off; this is a human-in-the-loop check, not CI):

```
Test Quality — PR with a happy-path-only test
  1. skills OFF (toggle both off in Skills Lab) → run  → expect: no coverage finding
  2. skills ON → re-run                               → expect: uncovered branch + edge case flagged
  3. open the run trace → prompt assembly             → skills block present, token count shown
API Contract — PR that changes a route signature
  same three steps; without skills the breaking change is missed, with skills it is caught
```

## Acceptance criteria

1. Linking an enabled skill to an agent and running a review produces a
   `## Skills / rules` section in the assembled prompt, in link order.
2. `prompt_assembly.skills` is non-null in the run trace when ≥1 enabled skill is
   linked, and `null` when the agent has no linked skills or all linked skills are
   disabled.
3. Omitting skills entirely (no links, or a lookup failure) yields a byte-identical
   user message to the pre-skills prompt — no stray section, no whitespace diff.
4. A `.md` import and a `.zip` import both preview without persisting anything, and
   both land `enabled: false` on confirm with a `<untrusted …>`-wrapped body.
5. A `.zip`'s non-markdown entries all come back `not_processed`; a `..`-path entry is
   rejected as `unsafe_path`; an oversized archive is rejected as `archive_too_large`.
6. Editing a skill's body bumps its version and adds a `skill_versions` row; editing
   only its name/description/enabled does not. Restore forward-bumps rather than
   rewinding the version counter.
7. Deleting a skill cascades its `agent_skills` links.
8. Unchecking a skill on the agent Skills tab removes the link (not just disables it)
   and the next review's prompt no longer contains that skill's body.
9. `pnpm db:seed` leaves two new agents (Test Quality Reviewer, API Contract Reviewer)
   each bound to one seeded skill, re-runnable without duplicating rows.
