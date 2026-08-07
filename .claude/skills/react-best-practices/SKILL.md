---
name: react-best-practices
description: "Modern React best practices and anti-pattern catalog (2025-26). Use when writing, reviewing, or refactoring React components, hooks, and state management. Covers component design, state patterns, hooks misuse, performance, data fetching, and code organization."
---

# React Best Practices & Anti-Patterns

Modern React conventions (2025-26). Covers what to do and what to avoid. For code examples, see [examples.md](examples.md).

## In this repo — read `client-architecture` first

This catalog is project-agnostic and assumes a Vite + Tailwind + axios + react-router
stack. DevDigest's `client/` is Next.js 15 App Router + `fetch` + TanStack Query +
inline `CSSProperties`, so six sections below **do not apply**. Placement, layering,
and file structure are governed by
[`client-architecture`](../client-architecture/SKILL.md), which wins on any conflict.

| Section below | In `client/` |
|---|---|
| Tailwind CSS | ✗ Styling is `styles.ts` exporting one `CSSProperties` object named `s`; colours are `var(--token)`. Tailwind 4 is installed but only powers the vendored design-system CSS — app code uses no utility classes. |
| `useApiQuery`/`useApiMutation` (Data Fetching) | ✗ No such hooks. Use `api` from `src/lib/api.ts` + TanStack `useQuery`/`useMutation`, all inside `src/lib/hooks/`. |
| `components/ui/` | ✗ The design system is vendored at `src/vendor/ui/` (`@devdigest/ui`) and is **consume-only** — never extend it here; fix the upstream. |
| Axios + React Patterns | ✗ `axios` is not a dependency. Cancellation and retries are TanStack's job. |
| Error Boundaries (`react-error-boundary`, `resetKeys`) | ✗ Not a dependency, and `resetKeys={[location.pathname]}` is a react-router idiom. App Router uses `error.tsx` / `global-error.tsx` — see `next-best-practices`. |
| Vite `manualChunks`, `React.lazy` route splitting | ✗ Next does not build with Vite (vitest only), and the App Router code-splits per route already. |
| `utils/` for shared helpers | ✗ Shared code lives in `src/lib/`; there is no `src/utils/`. |

Everything else — derive-don't-store, hooks rules, render factories, keys, conditional
rendering, a11y, over-engineering — applies as written and is this skill's territory,
not `client-architecture`'s.

## Severity Levels

Each rule is tagged with a severity for use by consuming agents:

- **CRITICAL** — Will cause bugs, broken reconciliation, or maintenance nightmares
- **HIGH** — Will cause performance issues or scaling problems
- **MEDIUM** — Will hurt maintainability or developer experience

---

## Component Design (CRITICAL)

- Components must be pure — same inputs = same outputs, no side effects during render
- Business logic in hooks/helpers, NOT in component bodies
- Data fetching lives in hooks, not component bodies; presentational components receive
  props and render UI. A *container component* is not required to achieve this — a
  colocated hook does it with no wrapper (see "Wrapper Components" below)
- Helper functions extracted OUTSIDE the component body
- Max 200 lines per component — split if larger
- Max 5-7 props — more suggests the component does too much
- One component per file (small colocated internal helpers are fine)

### Composition Patterns

- Compose small focused components over monolithic ones
- "Lift Content Up" — move children to the parent when the wrapper doesn't use them for logic
- "Push State Down" — keep state in the component that actually needs it
- Prefer `children` prop and composition over deep prop drilling

## Derive, Don't Store (CRITICAL)

The #1 React anti-pattern. Look for it in every review.

- NEVER store derived values in `useState` — compute during render
- NEVER use `useState` + `useEffect` to sync a computed value — just compute it
- Use `useMemo` ONLY if the computation is expensive (measured, not assumed)
- If a value can be calculated from existing props/state, calculate it inline

## State Management (HIGH)

### State Location
- Colocate state with the components that use it
- Don't lift state higher than necessary — it causes unnecessary re-renders
- Don't duplicate state across components

### Context API
- Context is for dependency injection (auth, theme), NOT global state management
- Context changes re-render ALL consumers — split contexts by concern
- Prefer hook return values over Context when only one subtree needs the data

### State Hygiene
- Not everything needs to be in `useState` — only values that change over time and affect the UI
- Combine related state with `useReducer` instead of multiple `useState` calls
- URL-dependent state (filters, pagination, search) belongs in URL search params, not component state

## Hooks (HIGH)

### useEffect Rules
Before each `useEffect`, ask: **Is there an external system being synchronized?** If no, it's misused.

- NEVER use `useEffect` for derived state — compute during render
- NEVER use `useEffect` for event handling — put logic in the event handler
- NEVER chain `useEffect`s that trigger each other — usually means derived state
- ALWAYS declare all dependencies correctly
- ALWAYS clean up subscriptions, timers, and event listeners

### Memoization Rules
Most `useMemo`/`useCallback` calls are unnecessary. Be skeptical:

- `useMemo` — only for actually expensive computations (sorting large datasets, complex transforms)
- `useCallback` — only when the function is passed to a `React.memo` child
- Simple string concatenation, arithmetic, or boolean checks do NOT need memoization

## Render Factories (CRITICAL)

camelCase functions returning JSX are NOT React components. They break reconciliation, hooks, and dev tools.

- NEVER use `renderThing()` pattern — use `<Thing />` component syntax
- ALWAYS use PascalCase for anything that returns JSX
- Render factories lose component identity on every render, causing full unmount/remount

## Inline Creation in JSX (HIGH)

New arrays, objects, and functions created inline in JSX props break `React.memo` on children.

- Extract static arrays/objects to module-level constants
- Extract dynamic arrays/objects to `useMemo`
- Extract inline functions to `useCallback` (only when passed to memoized children)

## Over-Engineering (CRITICAL)

### Premature Abstraction
- Abstractions with only one consumer are premature — inline it
- "Reusable" hooks with hardcoded field names are not reusable — accept config as parameters
- Context storing state that could be computed locally is over-engineered

### Wrapper Components
- Components that only call a hook and return `null` are unnecessary — call the hook directly
- Wrappers that only pass props through add indirection without value

## Data Fetching (HIGH)

- ALL data fetching in custom hooks, never in component bodies
- Handle loading, error, and empty states in the container component
- Use try-catch in async functions within hooks
- ~~Use the project's `useApiQuery`/`useApiMutation` core hooks~~ — **not in this
  repo:** `api` from `src/lib/api.ts` + TanStack hooks in `src/lib/hooks/`

## Tailwind CSS (MEDIUM)

> **Does not apply to DevDigest's `client/`.** App code uses no utility classes; see
> `client-architecture` `C9`. Keep this section for other projects.

- Use utility classes for all styling — no inline `style={}` objects
- Use responsive prefixes (`sm:`, `md:`, `lg:`) for responsive design
- Extract repeated class combinations into reusable components (Button, Card, Badge)
- Prefer the project's `components/ui/` over recreating common elements

## Error Boundaries (HIGH)

> **In DevDigest's `client/`:** `react-error-boundary` is not a dependency and
> `resetKeys={[location.pathname]}` is a react-router idiom. Use App Router's
> `error.tsx` / `global-error.tsx` (`next-best-practices`). The last bullet still holds.

- Use `react-error-boundary` package for function component-friendly API
- Include `resetKeys={[location.pathname]}` so boundaries reset on navigation
- Provide a "Try again" button that calls `resetErrorBoundary` in fallback UI
- Error boundaries do NOT catch errors in event handlers, async code, or SSR — use try/catch there

## Key Prop Patterns (CRITICAL)

- NEVER use array index as `key` when lists can be reordered, filtered, or modified
- NEVER use `Math.random()` or other unstable values as keys — causes full unmount/remount
- When mapping Fragments, put `key` on `<React.Fragment key={id}>`, not on a child

## Conditional Rendering (HIGH)

- NEVER use `{count && <Component />}` when `count` can be `0` — renders literal `0`
- Use `{count > 0 && <Component />}` or ternary instead
- Replace nested ternaries with early returns or extracted components
- For multiple UI states (loading/error/empty/success), use early returns pattern

## Accessibility (HIGH)

- Add `aria-label` to icon-only buttons — without it, they're invisible to screen readers
- Link error messages to fields with `aria-describedby` and `aria-invalid`
- Use `aria-live="polite"` for dynamic content updates (search results, notifications, toasts)
- Trap focus inside modals; provide escape path (Escape key + visible Close button)
- Announce route changes for screen readers (SPA navigation is silent by default)

## Performance Beyond Memoization (MEDIUM)

> **In DevDigest's `client/`:** Next does not build with Vite (vitest only) and the App
> Router already code-splits per route. Bundling is `next-best-practices`' territory.

- Use `React.lazy()` + `<Suspense>` for route-level code splitting
- Use Vite `manualChunks` to split vendor bundles for better caching
- Use top-level static paths in `lazy(() => import('./X'))` — dynamic paths break build analysis

## Axios + React Patterns (HIGH)

> **Does not apply to DevDigest's `client/`** — `axios` is not a dependency. All network
> access goes through `src/lib/api.ts` (`fetch` + an `ApiError` class); cancellation,
> retries and dedup are TanStack Query's job. See `client-architecture` `C14`.

- Cancel in-flight requests in `useEffect` cleanup using `AbortController`
- Use centralized Axios instance with `baseURL`, default headers, and interceptors
- Use request interceptors for auth tokens, response interceptors for 401/403 handling

## React 19 Patterns (MEDIUM)

- Accept `ref` as a regular prop instead of using `forwardRef` (React 19+)
- With React Compiler enabled, avoid adding `memo`/`useMemo`/`useCallback` unless measured

## Code Organization (MEDIUM)

### Feature-Based Structure
- Colocate component + hook + helpers + tests per feature
- Shared utilities go in `utils/` or `components/ui/`
- **In DevDigest's `client/`, placement is governed by
  [`client-architecture`](../client-architecture/SKILL.md)** — tiers, folder segments,
  and where constants/helpers/domain logic live. Shared code goes in `src/lib/` (there
  is no `src/utils/`), and business rules in `src/lib/domain/`.

### File Quality
- Order: imports, constants, helpers, component, exports
- Reuse existing types and constants over creating new ones
