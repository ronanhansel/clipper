# Performance

Read this before touching playback, inspector, scrub, or preview code.

## State layers

| Layer                                        | Use for                                     |
| -------------------------------------------- | ------------------------------------------- |
| `playbackTimeStore` (`useSyncExternalStore`) | Per-tick values (scene time, scrub clock)   |
| `editorStore` (zustand)                      | Structural state (project, selection, mode) |
| `useState`                                   | Component-local UI only                     |

`AppContent` must not own `useState` for shared values — it fans out to every subscriber on every change.

## Per-tick work stays out of React

```
playbackTimeStore  ──►  usePlayheadTime()  ──►  FramePreviewLive  ──►  FramePreview
   (publish per RAF)        (subscribe)            (sealed boundary)
```

- Subscribe via `usePlayheadTime(enabled)` in leaf components — bucketed at 30 Hz.
- Use `readPlayheadTime(currentTime)` in event handlers, not closed-over `currentTime`.
- For hot scrub paths, write to DOM imperatively (see `applyLivePartPreviewTime`).
- `currentSceneTime` is a derived structural value (preview-key boundaries only) — never thread it as a prop more than one level deep.

## Imperative DOM ownership

Two paths must not write the same DOM property each tick. Pick one owner.

- The playback rAF (`syncPlaybackDom`, `syncRenderClockLayersToSceneTime`) owns playhead chrome, time labels, scrubber values, and Web Animations sync.
- React renders the structural shell on preview-key changes; it does **not** drive per-tick attribute updates.
- A component-level `useLayoutEffect` that re-walks `getAnimations({subtree:true})` per `localTime` change is duplicate work — drop it; the rAF already syncs.

Whenever a subtree is hidden (e.g. an authoring DOM tree behind a live canvas), gate its store subscription with a `paused` flag so it stops committing.

## Avoiding re-renders

1. Profile first (React DevTools or a CPU trace). Don't refactor by guess.
2. Stabilise callbacks with `useCallback`. Inline arrows defeat memo.
3. Extract object/array literals to `useMemo` or module constants. Empty arrays/sets used as sentinels live at module scope, never `new Set()` inside render.
4. Wrap large prop bags in `useMemo` with explicit deps. The bag must keep referential identity across unrelated parent re-renders or downstream `memo()` is defeated.
5. Lazy-mount expensive sections. Conditional render is cheap.
6. Custom memo equality is a last resort — fix the props first.
7. Hoist expensive constructors (`Intl.DateTimeFormat`, regex, parsers) to module scope.

## List performance

- Memoise leaf views in large iterables (`memo(LeafView, areLeafPropsEqual)`).
- Hoist per-iteration helpers out of `.map()`. A lookup builder called inside the iteration is O(N²) and won't show up in profiles until the list grows.
- Don't drill values that are stable in one mode but vary in another. Example: `frameScale` matters in export but not preview — pass `frameScale=1` to children in preview mode and let the outer wrapper own the transform.

## Don't recompute pure derivations per tick

If the same plan, derivation, or filter runs across handler + effect + render, hoist to one call site and read fields from the bundle. `computePostProcessPlan` is the canonical example: one call per scheduler fire, multiple consumers read `passes`, `livePasses`, `visualStyleAfterLastLive`, etc.

## Input handlers

`flushSync` on input handlers (wheel, drag) forces a full synchronous render every event. Anchor layout imperatively instead:

1. Write the geometry directly to the DOM (`element.style.width`, `scrollLeft`).
2. Then `setState` normally.

React reconciles on the next tick; the user sees the imperative update immediately, with no synchronous render tax.

## Scheduler

`PreviewRenderScheduler` is the single owner of preview rendering rAFs.

- Idle (`isPlaying === false`): no rAF unless `requestRender(cause)` is called. Same-tick calls coalesce.
- Playing: scheduler runs its own rAF loop at the project FPS (skipping vsyncs as needed for 24 / 30).
- One scheduler per `PreviewColumn` mount. No global singletons.

Subscribe with `scheduler.subscribe(handler)`; trigger with `scheduler.requestRender(cause)`. Causes coalesce by priority: `play-tick > scrub > edit > resize > mount`.

Preview-event handlers (`clipper:*preview`, live inspector previews, gizmo
previews) must not render directly from the event callback. Store the latest
payload, then ask `PreviewRenderScheduler` for an `edit` render. If the
component is outside a scheduler provider, use one local rAF fallback that
coalesces to the latest payload. This keeps preview work under one rAF owner and
prevents high-frequency events from bypassing scheduler throttling.

During pointer drags, keep the visible feedback imperative and commit document
state once on gesture end. Per-frame project writes make drag feel heavier than
direct DOM/WebGL updates and fan out through React/store subscribers. The drag
path may still emit a preview event, but that event must follow the coalescing
rule above.

Coalescing choice affects feel. `requestAnimationFrame` coalescing can keep the
preview on the next frame; post-paint scheduling (`rAF` followed by
`setTimeout(0)`) intentionally waits until after a paint. Use post-paint only
when the first paint is the important feedback (for example playhead chrome
moving before expensive preview work). If the preview itself must follow the
cursor, use latest-rAF coalescing and make the preview work cheap enough for
that frame.

Scrub render causes must flow to the renderer. Transient scrub frames should
skip final-quality work that can be reused or refreshed after the gesture, such
as shadow-map rebuilds, expensive readbacks, or full diagnostic passes. Do not
let a parent React commit path bypass the scheduler cause and accidentally run
the heavier idle/playback render path during pointer movement.

## Direct GPU post-process

Direct GPU effects run through `CompositionRenderer` and must stay on the
scheduler/live-clock path. Scrub and space-bar playback are different execution
paths: scrub usually arrives through React props, while playback advances
imperatively through `PreviewRenderScheduler` ticks. Anything time-dependent in
the GPU post-process plan must derive from the tick's rendered time, not from a
stale React prop captured when playback started.

Direct visible output must stay on the mounted GPU host through transition
boundaries. DOM transition composition is for non-flattened authoring views only;
flattened Direct output routes through `DirectCompositionGpuHost` ->
`CompositionRenderer`.

CSS-only Direct transitions (fade/swipe/zoom/scale) use one WebGPU renderer with
two `CompositionSceneInput`s and a GPU A/B composite node. Post-process Direct
transitions (Film Burn, Light Leak Bands) stay on the post-process path and
update TSL uniforms rather than remounting the transition composite.

- Compute Direct post-process scene time from the rendered local time
  (`localTime - liveLocalTimeOffset`) before calling `computePostProcessPlan`.
- Do not put per-frame values such as VHS `time` into a WebGPU node signature.
  Use TSL uniforms and update the existing uniform node when only time changes.
- Treat output-node signature changes as structural. Rebuilding the WebGPU
  output pipeline per frame makes scrub/playback CPU-bound and can make GPU
  usage look low even though the effect is GPU-authored.
- Keep the scheduler subscription active once the capture canvas is ready. The
  scheduler emits `play-tick` only while playing, so the subscription itself
  should not be gated on an `isPlaying` prop that may update after playback
  starts.
- In Direct transitions, use current scene time for transition progress and
  post-process uniforms; use the derived from/to scene times only to select the
  two source frames.

## Strategy decisions

Strategy / decision logic (e.g. `selectPreviewStrategy`) is a pure tested function with a single decision point. Never re-decide inside the consuming component — a duplicate guard inside a strategy component will drift from the router and silently break the path it was meant to gate.

## IPC and main-process work

Profile reveals "freeze" patterns where the renderer waits on an Electron IPC reply (e.g. `system_profiler SPFontsDataType`). The fix is pre-warm at boot, not a renderer-side React change.

- Kick expensive main-process work in `app.whenReady().then(...)`.
- Pre-fetch from the renderer in `main.tsx` before the React root mounts.

## Anti-patterns

- `useState` in `AppContent` for shared values
- Per-tick values as deep props
- Inline arrow callbacks on memoised components
- `useEffect` running every playhead tick
- `flushSync` inside wheel / pointer handlers
- Two paths writing the same DOM property each tick
- Hidden duplicate subtrees that still subscribe to per-tick stores
- Catch-all fallbacks in render-model derivation
- Comments explaining what code does

## Profile decoding tip

CPU profile spike with concentrated self time in `node:events` and no JS parent → main-process IPC blocking the renderer. Profile spike with high `commitLayoutEffectOnFiber` self time tied to `getAnimations` → component-level effect duplicating playback rAF DOM work.

## Key files

- `src/app/features/playback/playbackTimeStore.ts` — per-tick store
- `src/app/features/playback/usePlayheadTime.ts` — bucketed live-time hook
- `src/app/features/playback/usePlaybackController.ts` — single rAF owner for DOM sync
- `src/components/preview/FramePreviewLive.tsx` — sealed re-render boundary
- `src/components/preview/scheduler/usePreviewRenderScheduler.ts` — preview rAF owner
- `src/components/preview/strategies/selectPreviewStrategy.ts` — pure strategy decision
- `src/components/preview/passes/usePostProcessPlan.ts` — single-shot plan compute
- `src/components/preview/three/DirectCompositionGpuHost.tsx` — Direct GPU scheduler bridge
- `src/components/preview/three/gpuPostProcessNodes.ts` — Direct GPU post-process node signatures/uniforms
- `src/components/inspector/inspectorRegistry.ts` — per-type dispatch
- `src/render-engine/renderClock.ts` — CSS / Web Animations playhead sync
