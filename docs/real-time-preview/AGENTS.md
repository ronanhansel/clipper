# Real-Time Preview Instructions

Use this whenever implementing live previews for scrubs, drags, sliders, pickers, camera motion, overlays, or timeline interactions.

## Core Rule

During pointer movement or number-scrub movement, do not write React state, Zustand state, project state, persistence, or history.

Use rAF-throttled imperative DOM updates for transient preview. Commit canonical state once on release, blur, pointer up/cancel, drop, or scrub end.

## Required Pattern

1. Store the pending preview value in a ref.
2. Schedule at most one `requestAnimationFrame`.
3. In the frame, mutate only targeted DOM properties such as `transform`, `opacity`, `filter`, `width`, `height`, or CSS variables.
4. On end, cancel pending rAF, hide/restore preview DOM, and commit the real state once.
5. If React also owns a visual, either keep React as the only owner or use a separate preview-only DOM node. Never let React and imperative preview write the same style during movement.

## Existing Reusable Paths

- Motion camera preview: `src/app/features/timeline/useMotionMarkerCommands.ts`
- Camera transform helpers: `src/app/features/timeline/motionCameraPreview.ts`
- Number scrub preview mode: `src/components/ui/input.tsx` with `numberScrubMode="preview"`
- Motion picker/focal dot preview: `[data-clipper-motion-pick-preview]` in `FramePreview`, updated imperatively from `App.previewMotionPickPoint`
- State-driven picker dot: `[data-clipper-frame-pick-point]`; hide it while the imperative motion preview dot is visible, restore it on cleanup
- Timeline block/marker drag previews: DOM-local preview helpers such as `applyTimelineBlockPreview`

## Number Scrubbing

Use `numberScrubMode="preview"` for live previews.

Do this:

```tsx
<Input
  type="number"
  numberScrubMode="preview"
  onNumberScrubPreview={(value) => previewSomething(value)}
  onNumberScrubEnd={clearPreview}
  onChange={(event) => commitSomething(event.target.value)}
/>
```

Do not call the commit updater from `onNumberScrubPreview`. `Input` dispatches one final `onChange` on release.

## Camera And Motion

Use `previewMotionMarker(partId, markerId, updater)` for motion marker previews.

It should build the preview transform with `buildMotionMarkerCameraPreviewTransform`, then apply it with `applyCameraPreviewToElement`. Include transform and filter, because motion blur uses camera filter.

For motion picker/focal point previews, update the imperative dot, not `framePickPreviewPoint`, during movement. Commit or preserve the final state only on release.

## Pointer Lock Scrubbing

Number scrub supports unbounded cursor movement. Preserve these constraints:

- Activate scrub only after the drag threshold is crossed, not on click or long click.
- Request pointer lock at scrub activation, not for every click.
- While locked, compute movement from `event.movementX` / `event.movementY`, not `clientX`.
- Hide cursor only during active scrub and restore it on cleanup.
- If pointer lock is denied, fall back gracefully.
- Electron must allow `pointerLock` / `pointer-lock` permissions in `electron/main.ts`.

## Common Pitfalls

- Do not use `numberScrubMode="continuous"` for high-frequency visual previews. It writes React/Zustand state during movement and can stutter.
- Do not call `setState`, `setFramePickPreviewPoint`, project mutation callbacks, or persistence callbacks inside preview movement loops.
- Do not imperatively mutate style properties that React also rewrites every render unless the mutation is a separate preview-only node.
- Do not create two visible overlays for one preview. If both state-driven and imperative overlays exist, explicitly hide one while the other owns the preview.
- Do not recompute large derived models in pointer-move paths.
- Do not update history until final commit.

## Verification Checklist

- Scrub/drag preview is smooth and does not stutter.
- Click or long click does not activate scrub; only actual drag does.
- Preview works past screen edges for number scrubs.
- Cleanup restores cursor, pointer lock, opacity, transform, and pending rAF refs.
- Exactly one preview dot/overlay is visible.
- Final value commits once and remains visible if the active mode expects it.
- Run `rtk npm run typecheck`, a targeted test if available, and `graphify update .` after code changes.
