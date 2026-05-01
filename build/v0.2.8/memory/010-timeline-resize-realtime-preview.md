# Timeline Resize Realtime Preview

## Context

Timeline block resizing in Direct mode committed the correct duration on pointer up, but the visual width preview could fail to update during the drag.

## Change

- `src/components/timeline/TimelinePanel.tsx` now uses one rAF-driven `timelineBlockPreviews` map for realtime block sizing across compositions, adjustment layers, and motion markers.
- `applyTimelineBlockPreview` / `clearTimelineBlockPreview` in `src/core/timelineLayers.ts` are back to transform-only previews for drag stacking and vertical layer movement; React-owned `left` / `width` values are previewed through `timelineBlockPreviews` instead.
- Motion marker resize no longer has separate zoom/translation preview state. Zoom and translation internals render through the same `motion` preview key shape.
- Motion marker previews are no longer wrapped in `startTransition`; rAF preview state updates synchronously so drag feedback is not deprioritized by React. `MotionLane` memoizes mended-edge calculations so resize frames do not repeatedly scan marker chains.
- Project, scene, timeline, timeline clip, composition, and library types no longer expose persisted `zoomMarkers`, `translationMarkers`, or `motionBlocks`. The canonical stored model is `motionMarkers` only.
- Timeline panel props receive scene-level `motionMarkers`. Effect-specific zoom/translation arrays are derived as transient view data with `getMotionMarkerViews(...)` for rendering, selection, snapping, clipboard, camera preview, and inspector calculations.
- Timeline project mutations update timeline-level `motionMarkers` on every scene motion edit and no longer write zoom/translation arrays back to the project document.
- Camera preview, editor derived state, timeline layer commands, clipboard commands, file-manager constructors, agent context, and project persistence now use canonical `motionMarkers` plus transient views.
- `src/core/motionEffects.ts` owns the canonical adapter functions: `getCanonicalMotionMarkers`, `getMotionMarkerViews`, `motionBlocksToMotionMarkers`, `motionMarkersToMotionBlocks`, and `withCanonicalMotionMarkers`. New code should use those helpers rather than storing zoom/translation arrays or `motionBlocks` on project documents.
- `getCanonicalMotionMarkers` now reads `motionMarkers` only; save-time legacy marker deletion and `motionBlocks` fallback paths were removed for the clean migration.
- Timeline-level motion marker inspector selection uses a transient virtual `__timeline_motion__` part in `src/app/state/editorDerivedState.ts`. This gives `ZoomInspector` / `TranslationInspector` a valid duration and part id for scene-level markers without storing zoom/translation arrays or pretending the marker belongs to a composition.
- Timeline-level motion marker edit callbacks in `useMotionMarkerCommands` also pass a virtual timeline-motion part into inspector updater functions, so start/duration clamping uses the scene timeline duration rather than the currently active composition duration.
- Timeline/editor selection state is now unified as `selectedMotionMarker` / `selectedMotionMarkers`. Timeline node context targets and marquee selection expose only three timeline node categories: composition (`part`), adjustment, and motion. Zoom/pan/rotate/perspective distinctions remain effect-specific inspector/rendering details derived from `motionMarkers`, not timeline marker categories.

## Verification

- `npm run typecheck`
- `npm test`

## Architecture Note

Realtime timeline interaction should stay rAF-throttled. Use `timelineBlockPreviews` for canonical `left` / `width` preview across all block categories. Use `applyTimelineBlockPreview` / `clearTimelineBlockPreview` only for transform-only drag concerns such as z-index, vertical row movement, and overflow handling. Timeline-facing APIs should model only composition, adjustment, and motion nodes. If effect-specific behavior is needed, derive it through `getMotionMarkerViews(...)` and do not add persisted or timeline-facing `zoomMarkers` / `translationMarkers` categories back to project, scene, clip, composition, selection, or context-target types.
