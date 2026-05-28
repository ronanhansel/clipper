# AGENTS.md

Project-agnostic engineering rules. For domain specifics, see `docs/`.

## Workflow

- You are working in development environment, if you need to browse saved projects, it's saved in clipper/ folder in this repo.
- Run `npm run typecheck` before committing (also formats).
- Don't run `git diff` unless asked.
- Don't fix errors not from your edits — they may be another agent's work.
- Don't touch files unrelated to your changes — another agent may own them.
- Don't reset/stash files. Multiple agents may share a file.
- Document every change in `agent-log/[version]/memory/[id]-feature-name.md` (next sequential ID, or update existing). Write incrementally on long tasks.
- `PLAN.md` only on request; if it exists, keep it current.
- Break major tasks into subagents to save tokens.

## Investigate before changing

- Profile before refactoring for performance. Don't optimise by guess; measure with a CPU trace, a test run, or a benchmark.
- For any lag, stutter, playback, scrub, preview, renderer, inspector, or hot-path performance query, read `docs/PERFORMANCE.md` before diagnosing or editing.
- Make sure `docs/PERFORMANCE.md` is only containing general rules, not specific cases. Only add to it if there's repetable patterns.
- Read the code path before claiming a cause. Symptoms in module A can be triggered by IPC, async I/O, or main-thread work that doesn't appear in A's source.
- Before extracting a wrapper, weigh saved lines vs added options-bag lines. If the wrapper only relocates an input bag, leave it.
- Before extracting a hook that depends on N helpers, lift the helpers into a shared module first. Hooks must not import their own consumer's internals.
- When extraction is blocked, document the prereq in a memo and stop. Don't ship a half-extraction with a shim.
- If a query or a task that still doesn't work after repeated fix, make sure to stop guess work and patching but ask the user to work with you to debug.

## Reuse before reinventing

- Search the codebase for an existing pattern, hook, helper, store, or registry that already solves the problem before writing a new one. The graphify graph, `search_graph`, and `grep` are faster than rewriting.
- Check `docs/` for documented patterns (state layers, registries, render seams, persistence). Pattern naming carries meaning — if it's already named, reuse the name and the implementation.
- Check `agent-log/[version]/memory/` for prior decisions on the same surface. Past memos document what was tried, what worked, and what was rejected with reasons.
- When two implementations exist for the same concept, collapse to one. Don't add a third.
- If the existing pattern is close but not exact, extend it (new registry entry, new field, new option) before forking. A fork creates a second source of truth that drifts.
- New abstractions need justification. Adding a hook, store, or context that duplicates an existing layer fragments state and adds fanout. Document why the existing layer doesn't fit before introducing a new one.
- Read the consumer side first. The shape of new code is dictated by who calls it; designing in isolation produces APIs that don't fit.

## Code rules

- Names carry meaning. No comments explaining what code does — rename instead.
- No backwards-compat shims, feature flags, `// kept for X` markers, or aliases of canonical APIs. Migrate call sites or don't rename.
- Solve the problem asked. No drive-by refactors, no extra abstractions, no defensive code beyond what the task requires.
- File >1500 lines? Decompose before adding to it.
- No catch-all fallbacks. Handle each case explicitly. If a new case is needed, surface it to the user before introducing it silently.
- No silent failures. Throw on invariant violations. Async persistence (`writeAppState` etc.) must verify the round-trip and return success/failure to the caller — never `void promise` for state the user can later check.
- One source of truth per concept. If a value has two derivations, collapse to one helper that both sides call.
- One typed config, not N parallel booleans. When N flags always travel together, group them into a single typed object and zero the wrapped fields once at the source, not at every consumer.
- Names reflect semantics. Reserve domain terms (e.g. "cache", "store", "controller") for things that match the contract. If something is precomputed without keying or eviction, don't call it a cache.

## State

- Per-tick / high-frequency values: external store with `useSyncExternalStore`. Subscribe at the leaf that needs it.
- Structural state (project, selection, mode): a single domain store with scoped selector hooks.
- Component-local UI state (popover open, hover): `useState`.
- Never put shared values in the root shell as `useState`; the root fans out to every subscriber.
- Delete dead store fields. A field that has only writers still triggers shallow-equality fanout on every write.
- Split monolithic `useShallow` selectors into feature-scoped hooks; each field appears in exactly one hook.
- Field-granular store merges. Partial-state setters must compare each key with `Object.is` and emit only changed fields, so unchanged-field selectors don't re-notify.

## React performance

- Per-tick values are never a prop more than one level deep. Subscribe at the leaf instead.
- In event handlers, read live values from the external store; don't close over the rendered value.
- Wrap callbacks passed to memoised components with `useCallback`. Inline arrows defeat memo.
- Extract inline object/array literals to `useMemo` or module constants. Empty arrays/sets used as sentinels live at module scope, never `new Set()` inside a render.
- Wrap large prop bags in `useMemo` with explicit deps. The bag must keep referential identity across unrelated parent re-renders or downstream `memo()` is defeated.
- Lazy-mount expensive sections.
- Hot paths can write DOM imperatively to bypass React. Two paths must not duplicate the same imperative work — one owner per DOM mutation.
- Pause invisible duplicate subtrees. When a hidden React tree shadows a visible canvas, gate its store subscription so it stops committing.
- Don't recompute the same pure derivation N times across handler + effect + render. Hoist to one call and read from the bundle.
- `flushSync` on input handlers is a smell. Anchor layout imperatively (write to DOM, then setState normally) instead of forcing a synchronous render every event.
- Hoist expensive constructors (`Intl.DateTimeFormat`, regexes, parsers) to module scope.
- Memoise leaf views in large lists. Hoist any per-iteration helper rebuild out of `.map()` — O(N²) lookups masquerade as fine until the list grows.
- Don't drill values that are stable in one mode but vary in another. Pass the stable value to children and let the wrapper own the variation.

## Modularity

- Decompose by feature concern, not file size. Cohesive units belong together; unrelated logic in the same file is the smell.
- Pure helpers leave the framework entirely. Math, transforms, snap rules → plain modules. React/UI wrappers stay in shells only when they close over UI controllers.
- Type-varying UI uses per-type registries. Adding a type means adding a section file plus a registry entry — no editing of the dispatch site. Always include a default entry for unknown types.
- React context for shared helpers, store for shared state. Don't conflate. Helpers don't change per render; data does.
- Strategy / decision logic is a pure tested function with a single decision point. Never re-decide inside the consuming component — duplicate decisions drift.
- Render entry points are pure functions: no React, no DOM, no refs. Pure functions are the seam for backend or platform swaps.

## Async persistence

- Persist + verify. After writing, read it back; return success/failure.
- Surface persist failures in the UI. Don't `void promise` and assume the toggle stuck — show an error when the round-trip failed, and roll back optimistic state if the failure is recoverable.

## Domain references

For project-specific patterns, see:

- `docs/ARCHITECTURE.md` — source layout, boundary rules, refactor workflow.
- `docs/PERFORMANCE.md` — playback, scrub, inspector hot paths.
- `docs/STATE.md` — store layering, selector strategy, persistence.
- `docs/MODULARITY.md` — decomposition patterns, registries, render seams.
- `docs/COMPOSE_DIRECT.md` — mode isolation, scene/composition wrapping.
- `docs/EFFECT_PACKAGES.md` — package-first effect authoring.
- `docs/AGENT_WORKFLOW.md` — agent context contract.

## Memory

- `agent-log/[version]/memory/` — sequential change memos. Use as evidence when proposing rules or revisiting decisions.
- Promote new knowledge into docs only when the user has confirmed the fix worked, the pattern is repeatable, and the knowledge is genuinely not covered already. Keep docs pristine: do not add case-specific notes, agent self-memory, or unconfirmed theories.

## graphify

This project has a graphify knowledge graph at `graphify-out/`.

- Before answering architecture or codebase questions, read `graphify-out/GRAPH_REPORT.md`.
- If `graphify-out/wiki/index.md` exists, navigate it instead of reading raw files.
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep.
- After modifying code in this session, run `graphify update .` to keep the graph current.
