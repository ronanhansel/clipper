# Performance Considerations

Hard-won lessons from inspector-lag and playback-stutter rewrites (memos
092–098). Read this before adding state, props, or render paths to anything
that mounts during playback or scrub.

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
