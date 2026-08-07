# onion-architecture — sources

Every rule in [SKILL.md](SKILL.md) traces to something here. Each entry names the
concrete rule it contributes, so a disagreement about a rule can be taken up with its
source rather than with the skill.

All URLs below were fetched and verified live when this file was written
(2026-08-06). Sources that only 404'd or turned out to be content-farm output were
dropped rather than listed.

## A. Canonical

**The Onion Architecture, Part 1** — Jeffrey Palermo, 2008
<https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/>
Names the pattern and the governing constraint: all coupling points toward the
centre, and "the database is not the center. It is external." Repository *interfaces*
sit just outside the domain model; implementations sit at the outer edge, "reserved
for things that change often." Also scopes itself — not for small websites.

**Part 2** — Jeffrey Palermo, 2008
<https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/>
The two mechanical rules behind rings 2–4: an outer class may only reference
interfaces defined *further in* than itself, and same-ring siblings may be used
directly while inner-ring collaborators must be injected.

**Part 3** — Jeffrey Palermo, 2008
<https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/>
Source of "any outer ring may call any inner ring directly" — the differentiator from
classic layering, where you must tunnel through each adjacent layer. Ends with the
four tenets, including: the core compiles and runs without infrastructure.

**Part 4: After Four Years** — Jeffrey Palermo, 2013
<https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/>
Two concessions worth keeping: onion architecture is orthogonal to DDD, and it does
**not** require an IoC container — he removed the container from the reference sample.
Cited against "onion means DDD means a container."

Series index: <https://jeffreypalermo.com/tag/onion-architecture/>
(The `jeffreypalermo.com/blog/...` links inside Part 1's body are stale — use the
date-based URLs above.)

**Hexagonal Architecture / Ports and Adapters** — Alistair Cockburn, 2005
<https://alistair.cockburn.us/hexagonal-architecture/>
The original. The app must be runnable "without a UI or a database," and the real
asymmetry is inside vs. outside, not left vs. right. Distinguishes primary/driving
ports from secondary/driven ports — the basis for O3's "mock the driven adapters."

**The Clean Architecture** — Robert C. Martin, 2012
<https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html>
The Dependency Rule, and the corollary behind O8: outer-layer data formats —
"especially framework-generated" ones — must not leak inward. Data crossing a
boundary should be shaped for the *receiving* inner layer.

**DDD, Hexagonal, Onion, Clean, CQRS… How I put it all together** — Herberto Graça,
2017 (updated 2020)
<https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/>
The best single synthesis. Two rules taken directly: ports live *inside* the core and
are shaped by core needs rather than by copying the tool's API (O2), and package by
component before layering inside it. Closes with its own anti-dogma caveat.

**Layers, Onions, Ports, Adapters: it's all the same** — Mark Seemann, 2013
<https://blog.ploeh.dk/2013/12/03/layers-onions-ports-adapters-its-all-the-same/>
"If you apply the Dependency Inversion Principle to Layered Architecture, you end up
with Ports and Adapters." Explains why UI and data access share the outer ring — both
are boundary components. Cited so the skill does not litigate terminology.

**Dependency rejection** — Mark Seemann, 2017
<https://blog.ploeh.dk/2017/02/02/dependency-rejection/>
Convert indirect output into return values and indirect input into plain parameters,
so the deciding function has no dependencies at all. "Pure functions can't depend on
impure functions."

**Impureim sandwich** — Mark Seemann, 2020
<https://blog.ploeh.dk/2020/03/02/impureim-sandwich/>
Names the service shape the skill mandates: impure gather → pure decide → impure act.
Framed as a pattern that is "conspicuously often possible," not a law.

**Functional architecture is Ports and Adapters** — Mark Seemann, 2016
<https://blog.ploeh.dk/2016/03/18/functional-architecture-is-ports-and-adapters/>
"The ports are all your IO code." Source of the sharpest line in the skill's service
section: passing a function that performs I/O into your core is not purity — pass the
already-fetched value.

**Composition Root** — Mark Seemann, 2011
<https://blog.ploeh.dk/2011/07/28/CompositionRoot/>
One unique location composes the modules, as close to the entry point as possible,
and **no module other than the root may reference the container** — the rule behind
ring 4 in the table. Also: libraries and frameworks shouldn't have composition roots.

**Pure DI** — Mark Seemann, 2014
<https://blog.ploeh.dk/2014/06/10/pure-di/>
"DI is a set of principles and patterns; DI Containers are optional helper
libraries." The justification for hand-wired construction in `platform/container.ts`
rather than a container library.

**Refactoring registration flow to functional architecture** — Mark Seemann, 2019
<https://blog.ploeh.dk/2019/12/02/refactoring-registration-flow-to-functional-architecture/>
A step-by-step refactor from functions-as-dependencies to a dependency-free core.
Read the comments: the author concedes complexity can merely migrate into the
composition, and that he would write simpler code when onboarding matters.

**Presentation Domain Data Layering** — Martin Fowler, 2015
<https://martinfowler.com/bliki/PresentationDomainDataLayering.html>
The honest reason to layer — it "reduce[s] the scope of my attention," not
substitutability. Once a layer grows, invert the nesting so top-level directories are
domain modules, each internally layered. That is exactly `modules/<name>/`.

**Boundaries** — Gary Bernhardt, SCNA 2012
<https://www.destroyallsoftware.com/talks/boundaries>
Origin of "functional core, imperative shell": prefer simple values as the seams
between subsystems. Testing consequence — many fast tests against the core, few
integration tests against the shell, which has fewer paths but more dependencies.

**Parse, don't validate** — Alexis King, 2019
<https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/>
The rule O8 implements: don't check-and-discard, convert into a type that carries the
proof forward, and do it once at the edge. Names the failure mode — "shotgun
parsing," checks scattered through processing code.

**How to implement Clean Architecture in Go** — Miłosz Smółka / Three Dots Labs, 2020
<https://threedots.tech/post/introducing-clean-architecture/>
Go, but the most codifiable layer spec found: domain imports nothing; the app layer
"has no idea whether it's being called by an HTTP request, a Pub/Sub handler, or a
CLI" (O4); declare interfaces next to the consumer; keep app types separate from DB
models; use port-agnostic errors that the HTTP layer maps to status codes.

**Railway Oriented Programming** — Scott Wlaschin, 2013
<https://fsharpforfunandprofit.com/posts/recipe-part2/>
The model for a `Result`-returning pure core: each step is one-in/two-out, composed
so the first error short-circuits. Validation is *the boundary step*.

**Demystifying software architecture patterns** — Rahul Garg / Thoughtworks, 2022
<https://www.thoughtworks.com/insights/blog/architecture/demystify-software-architecture-patterns>
A vendor-neutral comparison of hexagonal (2005), onion (2008) and clean (2012),
concluding they describe the same loosely-coupled testable system. Useful as a
citation when someone asks why we picked one name.

## B. TypeScript, Node, and this stack

**Atomic Repositories in Clean Architecture and TypeScript** — Lazar Nikolov /
Sentry, 2024
<https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript/>
The closest match to our stack, and the direct source of O9. Solves transactions
spanning Drizzle repositories: a transaction manager started at the outer layer and
threaded down, repositories taking an optional tx (`const invoker = tx ?? db`), and a
minimal `ITransaction` interface in the application layer so the concrete Drizzle
transaction type never crosses inward. Warns that `tx.rollback()` throws.

**Drizzle — Transactions** (official)
<https://orm.drizzle.team/docs/transactions>
Confirms the mechanics O9 depends on: `db.transaction(async (tx) => …)`, nested
transactions as savepoints, `tx.rollback()` throwing, and isolation level set at the
outermost call — i.e. a use-case concern, not a repository one.

**Drizzle — Goodies** (official)
<https://orm.drizzle.team/docs/goodies>
`$inferSelect` / `$inferInsert` let repository signatures derive from the schema
instead of being hand-maintained. `getColumns` supports omitting sensitive columns —
a concrete affordance for "repositories must not leak columns." `.toSQL()` and
`drizzle.mock()` work without a connection.

**Drizzle — Zod integration** (official)
<https://orm.drizzle.team/docs/zod>
`createSelectSchema` / `createInsertSchema` derived from tables. Listed here as the
thing O8 forbids at the HTTP boundary: the docs actively encourage using these to
validate API requests and carry no caution about coupling the wire contract to the
table. DB-derived schemas belong in ring 3, not ring 1.

**Zod — Basics** (official)
<https://zod.dev/basics>
`.parse()` throws `ZodError` and returns a deep clone; `.safeParse()` returns a
discriminated union. The subtle boundary rule: input and output types diverge once
`.transform()` is involved — publish `z.input<>` outward, `z.output<>` inward.

**fastify-type-provider-zod**
<https://github.com/turkerdev/fastify-type-provider-zod>
How Zod becomes Fastify's validator and serializer, which is what makes "parse once
at the edge" mechanical rather than aspirational. Caveats: strict Zod version
coupling, and you must handle `hasZodFastifySchemaValidationErrors` (→400) and
`isResponseSerializationError` (→500) in `setErrorHandler` — which `app.ts` does.

**Fastify — Plugins reference** (official)
<https://fastify.dev/docs/latest/Reference/Plugins/>
Fastify's encapsulation *is* a DI mechanism: `register` opens a scope and decorations
flow only to descendants. Implies the pattern `app.ts` follows — cross-cutting
infrastructure hoisted to root, feature modules left encapsulated. Trap: awaiting a
registration finalises encapsulation, so root decorations must exist first.

**@fastify/awilix**
<https://github.com/fastify/fastify-awilix>
The official answer for request-scoped DI, if we ever need it: `app.diContainer` for
singletons, `request.diScope` for per-request lifetimes registered in `onRequest` —
where a request-bound transaction or authenticated user would belong.

**awilix**
<https://github.com/jeffijoe/awilix>
"DI without special annotations" — no decorators, no `reflect-metadata`. `PROXY` mode
is minification-safe; `CLASSIC` is not. Notably the maintainers advise typing
services against their own options types rather than the container cradle, to
preserve real inversion of control.

**tsyringe** — Microsoft
<https://github.com/microsoft/tsyringe>
The counterweight, and why we don't use it: requires `experimentalDecorators` plus a
global `reflect-metadata` import, and because "interfaces don't have type information
at runtime," every port needs a string or symbol token — reintroducing stringly-typed
wiring, plus container annotations inside domain classes.

**The Functional Core, Imperative Shell Pattern** — Kenneth Lange, 2021 (upd. 2022)
<https://kennethlange.com/functional-core-imperative-shell/>
Demo repo: <https://github.com/kenneth-lange/ts-functional-core-imperative-shell>
"The shell can call the core, but the core cannot call the shell," with the added
constraint that the core is immutable values and pure functions. Contributes a
tie-breaker: ambiguous functionality should be made functional and pushed inward. The
repo models each workflow state as a distinct type in a tagged union.

**Functional Core, Imperative Shell (FCIS) in a TypeScript back-end** — redbar0n,
gist, revised through 2026
<https://gist.github.com/redbar0n/af5e339ea8b2563738455dcdf6042ed5>
The same use case in three escalating styles (plain TS unions, Effect.ts `Context.Tag`
ports, Effect generators). Best detail: the author walks back his own examples,
moving `crypto.randomUUID()` and password hashing out to the shell so the core takes
a plain boolean. Caveat — AI-generated samples, hand-annotated; a design sketch.

**Organizing App Logic with the Clean Architecture** — Khalil Stemmler, 2019
<https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/>
A TS/Node taxonomy of six logic types and where each belongs, with the pragmatism
clause the skill borrows: "Never over-engineer" — worth it when there are many
business rules and a long-lived, team-maintained codebase.

**DTOs, Mappers & the Repository Pattern in TypeScript** — Khalil Stemmler, 2019
<https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/>
The anti-leak rules behind O6: returning raw query results means a migration breaks
every client. DTOs are a stable data contract, not the domain model; mappers own
`toDomain` / `toPersistence` / `toDTO`. Argues against generic-only repositories in
favour of domain-expressive methods.

**DDD vs Clean Architecture** — Khalil Stemmler
<https://khalilstemmler.com/articles/software-design-architecture/domain-driven-design-vs-clean-architecture/>
A terminology map (Application Service ↔ Use Case; Domain Service ↔ no CA
equivalent). Included because most architecture arguments are vocabulary collisions.

**Hexagonal Architecture and Clean Architecture (with examples)** — Dyarlen Iber,
2022
<https://dev.to/dyarleniber/hexagonal-architecture-and-clean-architecture-with-examples-48oi>
Real TypeScript: a port, two adapters, a use case taking the port by constructor
injection. Explicit warning that Clean Architecture is "**NOT** just a folder
structure." The comments contain the anemic-core pushback — use cases should
orchestrate, not hold the business logic.

**Node.js Best Practices §1.1–1.3** — Yoni Goldberg et al.
<https://github.com/goldbergyoni/nodebestpractices>
Component-first structure: top level is business components, layered inside as
entry-points / domain / data-access. Contributes the sharpest form of O4 — never pass
request/response objects into domain functions, or the logic can't be reused by
tests, cron jobs, or queue consumers.

**Practica.js** — Goldberg et al.
<https://github.com/practicajs/practica>
A production-oriented Node starter defaulting to Fastify with a 3-tier folder
structure and deliberately **no DI container**: "Simplicity, how Node.js was
intended." The existence proof that onion-ish layering in Node needs no container.

### Boundary-enforcement tooling

Not currently wired up — this repo has no ESLint, and the `dependency-cruiser`
dependency in `server/` is a runtime library for indexing *user* repos, not a linter
for us. Listed so the option is documented if we ever want mechanical enforcement.

**eslint-plugin-boundaries** — <https://github.com/javierbrea/eslint-plugin-boundaries>
· docs <https://www.jsboundaries.dev/> · rules
<https://www.jsboundaries.dev/docs/rules/> ·
<https://www.jsboundaries.dev/docs/rules/dependencies>
Purpose-built: classify files into architectural elements, then write policies with
`from` / `allow` / `disallow` and `default: "disallow"`. Note `element-types`,
`entry-point`, `external` and `no-private` are deprecated in favour of
`boundaries/dependencies`. Policies evaluate top-to-bottom, last match wins.

**ESLint core `no-restricted-imports`** —
<https://eslint.org/docs/latest/rules/no-restricted-imports>
The zero-dependency option. Use `patterns`, not `paths`, for directory rules — `paths`
matches only the exact specifier. Two traps: static imports only, and negation does
not re-include a file under an excluded directory.
The `@typescript-eslint` extension of this rule
(<https://typescript-eslint.io/rules/no-restricted-imports/>) is **deprecated** — the
core rule has handled `import type` since ESLint v9.37.

**dependency-cruiser** — <https://github.com/sverweij/dependency-cruiser> · rules
reference
<https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md>
The heavyweight, and the only one with architecture-metric support. Standouts for
onion enforcement: regex back-references (`^src/modules/([^/]+)/` +
`to.pathNot: "^src/modules/$1/"`) to isolate peer modules without enumerating pairs;
`scope: "folder"` for folder-level cycles; `moreUnstable` for the stable-dependencies
principle; `dependencyTypes` to require type-only edges.

## C. Critiques and pitfalls

These are why [SKILL.md](SKILL.md) has a "when not to add a layer" section. A skill
that only cited group A would be a cargo cult.

**Is Clean Architecture Overengineering?** — Robert Laszczak & Miłosz Smółka /
Three Dots Labs
<https://threedots.tech/episode/is-clean-architecture-overengineering/>
(The `/post/` path 404s — use `/episode/`.) The best balanced critique. Overkill
signals: 2–3 person teams, trivial CRUD, libraries, code that fits in one head. Red
flags: six layers, and interface sprawl — "define an interface only where you'd
genuinely want a mock, and mock only I/O." Their test: "if you are using some
architecture and it's slowing you down… it's probably the bad one." Also warns the
reverse — excessive devotion to simplicity is "exactly the same issue."

**Vertical Slice Architecture** — Jimmy Bogard, 2018
<https://www.jimmybogard.com/vertical-slice-architecture/>
First-hand account of onion architecture failing on a real project: "within a couple
of months, the cracks started to show." His complaints — heavy mocking, rigid
dependency rules, mandated indirection ("Controller MUST talk to a Service that MUST
use a Repository") — are precisely what the skill's pragmatism rules exist to avoid.

**AnemicDomainModel** — Martin Fowler, 2003
<https://martinfowler.com/bliki/AnemicDomainModel.html>
Names the failure mode: domain objects as "little more than bags of getters and
setters" with all logic in services — "really just a procedural style design." You
pay the full cost of a domain model and collect none of the returns.

**OrmHate** — Martin Fowler, 2012
<https://martinfowler.com/bliki/OrmHate.html>
The counterweight to "wrap the ORM." An ORM covers ~80–90% of mapping, so keep
manholes down to SQL rather than pretending it's 100%. Two applicable points: bending
the domain model toward relations is an unavoidable trade-off, and read-only access
may not warrant the abstraction at all.

**Repository is the new Singleton** — Oren Eini (Ayende), 2009
<https://ayende.com/blog/3955/repository-is-the-new-singleton>
The classic repository-over-ORM critique, and the source of the skill's warning about
`findXWithAWithB(...)`: method explosion is inevitable once fetch strategy meets
filtering, and generalising just recreates the persistence API. His alternative maps
onto Drizzle — use the db handle directly, encapsulate complex reads in named query
functions.

**Domain model purity vs. completeness** — Vladimir Khorikov, 2020
<https://enterprisecraftsmanship.com/posts/domain-model-purity-completeness/>
The trilemma: completeness, purity, performance — pick two. Notes that wrapping a
repository in an interface does **not** restore purity. Recommends preferring purity,
because "domain logic fragmentation is a lesser evil than merging the
responsibilities of domain modeling and communication with out-of-process
dependencies." The principled reason a use case may do the lookup.

**Domain-centric vs data-centric** — Vladimir Khorikov, 2015
<https://enterprisecraftsmanship.com/posts/domain-centric-vs-data-centric-approaches/>
The honest cost curve: data-centric is easier to start and explodes with growth;
domain-centric costs upfront and only later overtakes. Names the real barrier — it
requires knowing both database and OOP/FP best practices.

**Don't use Ids in your domain entities!** — Vladimir Khorikov, 2014
<https://enterprisecraftsmanship.com/posts/dont-use-ids-domain-entities/>
Listed as a *considered position, not a rule* — it conflicts with mainstream
reference-by-id aggregate guidance. The transferable part is his own caveat: the
advice applies only to domain entities; IDs are entirely appropriate in application
services and infrastructure.

**CUPID: for joyful coding** — Dan North, 2022
<https://dannorth.net/blog/cupid-for-joyful-coding/>
The meta-critique. Rules produce binary compliance; properties define a centre to
move toward, so code is only nearer or farther and there is always a direction of
travel. His Domain-based property endorses use-case-named top-level directories over
`models/views/controllers` — which is why `modules/` is keyed on features.

**Against Railway Oriented Programming** — Scott Wlaschin, 2019
<https://fsharpforfunandprofit.com/posts/against-railway-oriented-programming/>
The author limiting his own pattern six years later — a model for how to hedge.
`Result` is for domain errors, not error handling generally; think of it as "a
glorified boolean with extra information." His taxonomy is directly encodable: domain
errors → `Result`, panics → throw and catch at the top, infrastructure errors → ask.

## Changelog

### 1.0.0 — 2026-08-06

Initial skill. Ring table mapped to real paths, rules O1–O9, service-shape section,
"when not to add a layer," and audit mode. Deliberately scoped: rules and an audit
workflow only — no lint config, no CI step, and no inventory of existing violations.
