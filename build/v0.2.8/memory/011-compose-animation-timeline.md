# Compose Animation Timeline

## Goal

Make Compose mode operate on the active composition only: playback, preview time, and the bottom timeline should be bounded to the composition under the scene playhead. Replace the full scene timeline UI in Compose with a composition-local animation timeline whose rows come from composition layers and whose blocks represent layer/object motion.

## Architecture Note

- Compose animation editing should reuse timeline concepts and helpers where possible instead of growing a separate timeline interaction stack.
- Main scene timeline data remains the persistence owner. Composition-local animation rows should derive from the active composition data loaded through the timeline/project state path, and edits should commit through the existing composition update command path.
- The initial animation rows are layer-backed: foreground objects, background elements, and the background layer. Authored `Component`/`Group` nesting remains blocked on source-evaluation metadata.

## Implementation

- Added `src/components/compose/ComposeAnimationTimeline.tsx`, a Compose-local bottom timeline that derives rows from the active composition's foreground objects, background elements, and background layer.
- Compose animation blocks are generated from each layer's `motion` track and use the neutral light-grey treatment requested for default animation markers. The block label summarizes animated properties such as `opacity`, `x`, `y`, `path`, `scale`, and `rotate`.
- The new timeline reuses shared timeline constants and helpers (`defaultTimelinePixelsPerSecond`, `getTimelineTicks`, `TimeRuler`, `TimelineViewportState`) rather than duplicating ruler/zoom math.
- Scrubbing the Compose animation timeline writes scene time as `activeComposition.start + localTime`, while the displayed ruler/playhead stays local to the composition duration.
- Dragging or resizing an animation block updates `motion.delay` and `motion.duration` only on pointer release. Object/background edits commit through `updateObjectById()` and `updatePartBackground()`, which route through `updateCompositionForTimelinePart()` and therefore persist in the main project/timeline document path.
- `usePlaybackController()` now accepts an optional playback range. Compose mode passes the active composition bounds, so playback controls, labels, start/end jumps, and playback completion are clamped to the current composition instead of the full scene.
- Compose preview now excludes scene adjustment layers, scene motion layers, and comp hiding so the page showcases the composition itself without scene-level timeline effects.
- Compose active-composition lookup uses raw scene time instead of adjustment-shifted scene time, so the page follows the composition under the playhead directly.
- Added a Compose/Direct mode switch to the Compose animation footer and its no-active-composition empty state, preserving a visible return path after the full scene timeline is replaced in Compose mode.
- Split Direct and Compose timeline viewport persistence. Direct continues to use `editorState.timeline`, while the Compose animation timeline now reads and writes `editorState.composeTimeline` so zoom/displacement changes do not affect each other.
- Fixed Compose playhead/progress sync: local Compose playback now maps playhead position against the exact composition duration instead of the padded timeline display duration, and Compose scrubbing updates the playhead DOM immediately while dragging.
- Extracted Direct's scrub/playhead interaction into `src/components/timeline/useTimelineScrubber.ts`. The shared hook owns pointer capture, rAF coalescing, imperative playhead preview, edge auto-scroll, shift snapping, throttled selection commits, and final flush on pointer release.
- `TimelinePanel` now uses `useTimelineScrubber()` for the existing Direct timeline behavior, while `ComposeAnimationTimeline` uses the same hook with `duration === displayDuration === composition.duration` and maps local scrub time to scene time in `App.tsx`.
- Replaced the separate `ComposeAnimationTimeline` component with a Compose branch inside `src/components/timeline/TimelinePanel.tsx`. Compose now uses the same timeline shell primitives as Direct: `LayerLabel`, `LayerResizeSeparator`, `TimelineLayerLane`, `TimelineBlock`, `TimeRuler`, zoom controls, scroll syncing, and `useTimelineScrubber`.
- Removed `src/components/compose/ComposeAnimationTimeline.tsx`; `App.tsx` always renders through `TimelineProvider`/`ConnectedTimelinePanel`. In Compose mode, `TimelinePanel` receives the active composition, local current time, Compose viewport state, layer rename callbacks, object/background motion update callbacks, and local scrub adapter.
- Compose animation rows now support Direct-style row height resizing, Direct-style marker height, marker drag/resize with pointer-release commits, and double-click rename through the shared `LayerLabel`. Object and background-element renames update `FrameObject.name`; background row rename updates `background.name`.
- Reworked Compose animation timing drag so it no longer uses raw pixel-to-time clamping as a separate simplified model. Compose now uses the same timeline snapping primitives as Direct (`getSharedTimelineBlockSnap`, `getSharedTimelineSnapGuideTime`), a Direct-style snap guide, Shift key updates while dragging, scroll-aware delta calculation, and edge auto-scroll during marker moves/resizes.
- Compose scrub snapping now passes local animation boundaries into `useTimelineScrubber`, and `useTimelineScrubber` supports the shared magnetic scrub toggle via `snapEnabled` instead of only snapping on Shift.
- Replaced the custom Compose marker component with the shared `MotionLane`/`TimelineBlock` renderer. Compose `MotionTrack` rows are now adapted into a synthetic `TimelinePartMotionView` with one translation marker per animated object/background layer; marker rendering, selection outline, resize handles, labels, preview maps, and neutral marker styling flow through the shared motion-lane code.
- Compose-specific code is now mainly an adapter layer: build rows from composition objects/backgrounds, convert `MotionTrack.delay/duration` to synthetic marker `start/duration`, and commit final marker timing back to the owning object/background `MotionTrack`.
- Extracted drag edge auto-scroll into `src/components/timeline/useTimelineDragAutoScroll.ts` and wired both Direct block/marker drags and Compose timing drags through it. Direct syncs the ruler and schedules its drag preview on scroll; Compose additionally persists viewport displacement through `saveTimelineDisplacement` before scheduling its preview.
- Moved timeline viewport drag-leave handling into `TimelineShell` via `onTimelineViewportDragLeave`, so Direct and Compose can both render lane rows directly into the shell grid without wrapper elements changing grid child layout. Direct uses the shell hook to clear effect drag previews when drag leaves the viewport; Compose omits it.

## Verification

- `npm run typecheck` passes.
- `npm test` passes with 84 tests.
- `npm run typecheck` passes after adding the Direct return control.
- `npm run typecheck` passes after fixing Compose playhead/progress sync.
- `npm run typecheck` passes after extracting the shared timeline scrubber.
- `npm test` passes with 84 tests after extracting the shared timeline scrubber.
- `npm run typecheck` passes after moving Compose animation into `TimelinePanel`.
- `npm test` passes with 84 tests after moving Compose animation into `TimelinePanel`.
- `npm run typecheck` passes after replacing Compose's simplified timing drag with shared snapping behavior.
- `npm test` passes with 84 tests after replacing Compose's simplified timing drag with shared snapping behavior.
- `npm run typecheck` passes after moving Compose marker rendering to `MotionLane`.
- `npm test` passes with 84 tests after moving Compose marker rendering to `MotionLane`.
- `npm run typecheck` passes after sharing drag edge auto-scroll between Direct and Compose.
- `npm run typecheck` passes after moving Direct viewport drag-leave handling into `TimelineShell`.
