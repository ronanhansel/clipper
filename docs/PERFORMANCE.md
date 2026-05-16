# Performance

Read this before touching playback, inspector, or scrub code.

## State layers

| Layer | Use for |
|-------|---------|
| `playbackTimeStore` (`useSyncExternalStore`) | Per-tick values (scene time, scrub clock) |
| `editorStore` (zustand) | Structural state (project, selection, mode) |
| `useState` | Component-local UI only |

Don't add `useState` to `AppContent` for shared values — it fans out to every subscriber every tick.

## Per-tick work stays out of React

```
playbackTimeStore  ──►  usePlayheadTime()  ──►  FramePreviewLive  ──►  FramePreview
   (publish per RAF)        (subscribe)            (sealed boundary)
```

- Subscribe via `usePlayheadTime(enabled)` in leaf components — bucketed at 30 Hz.
- Use `readPlayheadTime(currentTime)` in event handlers, not closed-over `currentTime`.
- For hot scrub paths, write to DOM imperatively (see `applyLivePartPreviewTime`).

## Avoiding re-renders

1. Profile first (React DevTools). Don't refactor by guess.
2. Stabilise callbacks with `useCallback`. Inline arrows defeat memo.
3. Extract object/array literals to `useMemo` or module constants.
4. Lazy-mount expensive sections. Conditional render is cheap.
5. Custom memo equality is a last resort — fix the props first.

## Modularity

- File >1500 lines? Decompose by domain.
- Per-type registries (e.g. `inspectorRegistry`) for type-varying behaviour.
- React context for helpers, store for state. Don't conflate.
- Always include a default registry entry for unknown types.

## Compose vs Direct

Modes share only the playhead clock. Mode-state must be cleared on switch (`clearDirectSelection` / `clearComposeSelection`). Don't leak object selection between modes.

## Anti-patterns

- `useState` for shared values
- `currentSceneTime` as a prop more than one level deep
- Inline arrow callbacks on memoised components
- `useEffect` running per playhead tick
- Comments explaining what code does

## Key files

- `src/app/features/playback/playbackTimeStore.ts` — per-tick store
- `src/app/features/playback/usePlayheadTime.ts` — bucketed live-time hook
- `src/components/preview/FramePreviewLive.tsx` — sealed re-render boundary
- `src/components/inspector/inspectorRegistry.ts` — per-type dispatch
- `src/render-engine/renderClock.ts` — CSS / Web Animations playhead sync
