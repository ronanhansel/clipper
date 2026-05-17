# AGENTS.md

## Workflow

- Run `npm run typecheck` before committing (also formats).
- Don't run `git diff` unless asked.
- Don't fix errors not from your edits — they may be another agent's work.
- Document every change in `agent-log/v0.2.19/memory/[id]-feature-name.md` (next sequential ID, or update existing). Write incrementally on long tasks.
- `PLAN.md` only on request; if it exists, keep it current.
- When performing major tasks with multisteps, break down and use subagents to save on tokens.

## Code rules

- No comments explaining what code does. Names should make that obvious.
- No backwards-compat shims, no feature flags, no `// kept for X` markers.
- Solve the problem asked. No drive-by refactors, no extra abstractions.
- File >1500 lines? Decompose before adding to it.

## State

- **Per-tick values** (scene time, scrub clock): module store + `useSyncExternalStore`. Subscribe via `usePlayheadTime`.
- **Structural state** (project, selection, mode): zustand `editorStore`.
- **UI-local** (popover open, hover): `useState`.
- Never add `useState` to `AppContent` for shared values — it fans out to every subscriber.

## React performance

- `currentSceneTime` is never a prop more than one level deep. Subscribe through the store.
- In event handlers, use `readPlayheadTime(currentTime)` — don't close over the rendered time.
- Wrap callbacks passed to memoised components with `useCallback`. Inline arrows defeat memo.
- Extract inline object/array literals to `useMemo` or module constants.
- Lazy-mount expensive sections (animator controls, font selectors).
- For hot scrub paths, write DOM imperatively — bypass React.

## Modularity

- Type-varying UI uses per-type registries (see `inspectorRegistry.ts`). New type → new section file + registry entry.
- React context for shared helpers, store for shared state. Don't conflate.
- Always provide a default registry entry for unknown types.

## Compose vs Direct

- Modes share only the playhead clock.
- Object inspector is Compose-only. Direct shows motion / adjustment / transition / composition inspectors.
- On mode switch, mode-state must be cleared (`clearDirectSelection` / `clearComposeSelection`).

## Reference

- `docs/PERFORMANCE.md` — performance playbook (one page).
- Memos `agent-log/v0.2.18/memory/092-098, 117` — context on past inspector / playback rewrites and the Compose/Direct boundary leaks that the v0.2.19 split addresses.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:

- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
