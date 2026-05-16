# Performance Considerations

Hard-won lessons from inspector-lag and playback-stutter rewrites (memos
092–098). Read this before adding state, props, or render paths to anything
that mounts during playback or scrub.

## Quick checklist for future agents

Before you write code, run this against your design:

- [ ] **Does this state belong in React, or in a module-scope store?** If many
  components read it and it changes more than once a second, put it in a
  store with `subscribe / getSnapshot` and consume via `useSyncExternalStore`.
  Don't reach for `useState` or zustand by reflex.
- [ ] **Will the value be threaded as a prop more than one level deep?** If
  yes, route it through a store or a focused React context instead. Prop
  drilling defeats `React.memo` and re-renders the whole subtree.
- [ ] **Does anything I'm adding update on every playhead tick?** If yes, it
  must subscribe through `usePlayheadTime` (bucketed at 30 Hz) or write to
  the DOM imperatively. Per-tick React state setters at any level above the
  sealed render boundary are forbidden.
- [ ] **Is there an inline arrow callback on a memoised component?** Wrap
  with `useCallback` or move the closure inside the child. Inline arrows
  break shallow equality and re-render every commit.
- [ ] **Am I editing a 1000+ line file?** Stop. Decompose first. The
  inspector and timeline panels both went through monolith-to-registry
  refactors — follow the pattern: per-type sections, registry dispatch,
  context for shared helpers.
- [ ] **Did I add a feature flag or backwards-compat shim?** Delete it.
  Just change the code. No `// kept for X` comments, no dead branches.
- [ ] **Did I write a comment explaining what the code does?** Delete it.
  Names should explain what; comments are for non-obvious why.
- [ ] **Did I update `agent-log/v0.2.18/memory/[id]-*.md`?** Mandatory.
  Without it, the next agent has to rediscover what you learned.

## Modularity rules

### Decompose by domain, not by file size

When a file passes ~1500 lines, split it. But don't split arbitrarily —
follow the natural seams:

- **Per-type registries** for things that vary by object type (inspector
  sections, render handlers, evaluators). One file per type, one registry
  that maps type → handler.
- **Per-feature folders** for cross-cutting concerns (`features/playback`,
  `features/timeline`, `features/inspector`). Each folder owns its store,
  its hooks, and its UI.
- **Shared utilities** in a `shared.ts` or named module — never copy-paste.

### React context for helpers, store for state

`ObjectInspectorContext` is the right pattern: ~30 helper functions go
through context once, sections call `useObjectInspector()` to grab what
they need. The alternative — props — would have re-rendered the whole
inspector every time any helper's reference changed.

State (values that mutate) goes in the store. Helpers (functions that act
on state) go in context. Don't conflate them.

### One default, no exceptions

When designing a registry, include a `defaultDefinition` so unknown types
fall through gracefully. New object types just register an entry; missing
ones still render something sensible. This is what
`getInspectorTypeDefinition` does.

### File naming follows the structure

- `src/components/inspector/sections/TextSection.tsx` — plug into registry
- `src/components/inspector/inspectorRegistry.ts` — the dispatch table
- `src/components/inspector/objectInspectorContext.tsx` — shared helpers
- `src/components/inspector/scrubLive.tsx` — shared live-time wrappers
- `src/components/inspector/inspectorShared.ts` — shared types/utilities

If you can't figure out where a new file belongs, the structure is wrong.
Refactor the structure before adding the file.

## External storage / state management

The repo runs three layers of state. Use the right one.

| Layer | Use for | Don't use for |
|-------|---------|---------------|
| `playbackTimeStore` (module scope, `useSyncExternalStore`) | Per-tick values: scene time, scrub clock | Anything structural |
| `editorStore` (zustand) | Project state, selection, mode, structural sceneTime | Anything per-tick |
| Local `useState` | Component-local UI (open/closed, hover, focus) | Anything shared between components |

### Why three layers?

- `useSyncExternalStore` over a module-scope store is the only option when
  many components need a high-frequency value. Zustand's `useStore`
  re-renders the calling component on every change; the external store can
  bucket and dedupe before the React commit.
- Zustand is the right tool for structural state — it survives across
  components, supports selectors, plays well with devtools.
- `useState` is for ephemeral local state — popover open, input focused,
  hover-as-cursor, etc. Anything that other components need to read should
  not be `useState`.

### Adding a new shared value

1. Is it per-tick? Add to `playbackTimeStore` (or a new dedicated store).
2. Is it structural? Add to `editorStore` with a selector.
3. Is it derived from existing state? Add to `useEditorDerivedState` —
   `useMemo` keys it on the underlying store values.
4. Don't shortcut by adding `useState` to `AppContent`. Every value at the
   top fans out to every subscriber.

### Reading state without subscribing

Inside event handlers, you often want a one-shot read, not a subscription:

```typescript
// WRONG — subscribes the handler-owning component to every change
const time = useEditorStore((s) => s.currentSceneTime);

// RIGHT — one-shot read, no subscription
const time = useEditorStoreApi.getState().currentSceneTime;

// RIGHT — fresh-as-possible per-tick read
const time = getMasterTimelineClockSnapshot().displayTime;
```

## Avoiding re-renders: the playbook

### 1. Find the offender first

Open React DevTools Profiler, hit record, do the slow interaction. The
component at the top of the flame graph is your suspect. Don't refactor by
guess — memo 095 broke playback because it gated the wrong commit.

### 2. Check what props it receives

If the component is memoised but still re-rendering, one of its props
changed reference. Common culprits:

- Inline arrow callbacks: `onChange={() => …}` — wrap with `useCallback`.
- Object/array literals: `style={{ … }}` — extract to `useMemo` or module
  constant.
- Props derived from a tick-driven value at the parent level — move the
  derivation into the child's own `usePlayheadTime`/`useSyncExternalStore`.

### 3. Custom equality is a last resort

`React.memo(Component, customEqual)` works but is fragile. Prefer:
1. Stabilise the props (callbacks, objects).
2. Move tick-driven props out of the prop bag and into a store.
3. Only then reach for custom equality, and gate it on `isPlaying` or
   similar so it only kicks in during the hot path.

### 4. Lazy mount expensive subtrees

When a panel has a heavy section (animator controls, font selector,
gradient picker), don't mount it until needed. The wrong shape:

```typescript
<Panel>
  <ExpensiveSection always-mounted />
</Panel>
```

The right shape:

```typescript
<Panel>
  {showExpensive ? <ExpensiveSection /> : null}
</Panel>
```

`React.lazy` for code-splitting; conditional render for cheap unmount.

### 5. Don't fight reconciliation

If you find yourself adding `React.memo` to every component, you're
solving the wrong problem. Either the parent is re-rendering for no good
reason (find why), or you're routing per-tick values through React when
they should be in a store.

## Core principle: keep per-tick work off React

The visible animation is driven by JS-interpolated values fed to React via
`FramePreview`. That commit is **load-bearing** — removing it breaks playback.
But it must happen in a sealed subtree, not at `AppContent`, or every header /
sidebar / inspector pays the cost.

```
playbackTimeStore  ──►  usePlayheadTime()  ──►  FramePreviewLive  ──►  FramePreview
   (publish per RAF)        (subscribe)            (re-render here)
```

`AppContent` reads `currentSceneTime` from the editor store, which only
updates at structural boundaries (preview-key change, scrub commit, pause).

## Rules

### 1. Time goes through the store, not props

When you need the live playhead in a leaf component, subscribe via
`usePlayheadTime(enabled)` from `src/app/features/playback/usePlayheadTime.ts`.
Do **not** thread `currentSceneTime` through component props past the
inspector boundary. The store is bucketed at 30 Hz by default — that's the
budget.

For event handlers (toggle keyframe, commit a value), call
`readPlayheadTime(currentTime)` instead of closing over `currentTime` — it
returns the master clock's `displayTime` so writes land at the actual
playhead, not the last rendered frame.

### 2. `AppContent` re-renders are expensive — keep them rare

Anything that reads from the editor zustand store at the top level fans out
to every connected child. Before adding `useState` or a new selector, ask:
"does this need to update on every tick, or just at structural boundaries?"
If it's per-tick, route through `playbackTimeStore` instead.

### 3. `React.memo` is cheap. Don't ship a tick-driven prop.

`React.memo` with default shallowEqual still re-renders if any prop
reference changes. Inline arrow callbacks (`onClick={() => …}`) defeat memo.
For components that mount during playback (inspector rows, transform
fields), use `useCallback` for handlers and route mutable state through a
store, not a prop.

The inspector originally had ~30 inline arrow callbacks on
`ConnectedInspectorContent`, defeating its memo even though
`currentSceneTime` was stripped from the equality check. Stabilising the
callbacks recovered the win.

### 4. Lazy-mount expensive subtrees

Text inspectors carry the heaviest section (animator controls, font
selector). Wrap them in lazy mount points so a freshly selected text
object doesn't pay the full mount cost on the first frame of playback.
See `TextAnimatorsSection` for the pattern.

### 5. Imperative DOM > React for hot scrub paths

`applyLivePartPreviewTime` (`FramePreview.tsx`) writes transforms /
opacity / filters directly to DOM nodes via `subscribeMasterTimelineClock`.
This bypasses React entirely for the per-tick scrub path. Use this pattern
when adding new live-evaluated properties — don't push them through React
state.

CSS animations are pinned to the playhead via the
`--clipper-render-time-ms` custom property; see `renderClock.ts`.
`syncDomAnimationsToRenderClock` plays / pauses Web Animations API
animations and sets `currentTime` directly. Per-tick reactivity for keyframe
diamonds and live readouts goes through `usePlayheadLiveTime` (gated per row
via `enabled` so untracked properties stay React-stable).

### 6. `useSyncExternalStore` over `useState` for shared mutable state

When a value is read by many components and updated frequently, prefer a
module-scope publish/subscribe store (like `playbackTimeStore`) over
zustand or `useState`. `useSyncExternalStore` skips the React reconciler
entirely for non-changing subscribers.

### 7. Profile before guessing

Memo 094 found the worst first-click freeze was an Electron `system_profiler`
IPC, not React. Memo 095 tried to gate the per-frame React commit and broke
playback. Conclusions: open the React DevTools Profiler, watch which
components commit per tick, and confirm the cost is where you think it is
before refactoring.

## Anti-patterns to reject in review

- A `useState` at top-level `AppContent` that updates every tick
- A `currentSceneTime` prop threaded more than one component deep
- An inline arrow callback (`onChange={() => …}`) on a component that
  mounts during playback
- A `useEffect` that runs per playhead tick (subscribe to the store
  directly instead)
- Reading from a zustand selector inside a hot loop (use `getState()` /
  `getSnapshot()` for one-shot reads)

## Inspector-specific patterns

The inspector is split into per-type sections (`src/components/inspector/sections/`)
plugged into a registry (`inspectorRegistry.ts`). Adding a new object
type does not require touching the monolith — write a section, add a
registry entry. Sections receive shared helpers via
`useObjectInspector()` (React context), not props, so an extra helper
doesn't fan out a thousand reconciliations.

Live readouts inside sections must use `LiveAttributeKeyframeIndicator` or
`KeyframedRow` — both gate their per-row subscription on `hasTrack` so
properties without keyframes pay zero per-tick cost.

## Mode isolation: Compose vs Direct

Compose and Direct share the playhead clock and nothing else. They differ in:
- Which layers render (motion / adjustment / transition: Direct only)
- Which inspector renders (object: Compose only; motion / adjustment /
  transition / composition: Direct only)

When adding a feature, ask "is this Compose-state, Direct-state, or shared?"
Shared state must be in the editor store; mode-state must be cleared by
`clearDirectSelection` / `clearComposeSelection` on mode change. Otherwise
state leaks between sub-apps.

## Where the work ended up

| File | Role |
|------|------|
| `src/app/features/playback/playbackTimeStore.ts` | Module-scope time store, published per RAF |
| `src/app/features/playback/usePlayheadTime.ts` | 30 Hz bucketed live-time hook |
| `src/components/preview/FramePreviewLive.tsx` | Sealed per-tick re-render boundary |
| `src/components/preview/FramePreview.tsx::applyLivePartPreviewTime` | Imperative DOM writes for hot scrub |
| `src/components/inspector/inspectorRegistry.ts` | Per-type section dispatch |
| `src/components/inspector/scrubLive.tsx` | Per-row live-time gates |
| `src/render-engine/renderClock.ts` | CSS / Web Animations playhead sync |

## Memos worth re-reading

- `agent-log/v0.2.18/memory/092-inspector-scrub-rerender.md`
- `agent-log/v0.2.18/memory/093-inspector-mount-lag.md`
- `agent-log/v0.2.18/memory/094-inspector-lag-system-profiler.md`
- `agent-log/v0.2.18/memory/095-playback-tick-rerender.md`
- `agent-log/v0.2.18/memory/096-inspector-time-store-rework.md`
- `agent-log/v0.2.18/memory/097-inspector-modular-registry.md`
- `agent-log/v0.2.18/memory/098-mode-isolation-inspector-bleed.md`
