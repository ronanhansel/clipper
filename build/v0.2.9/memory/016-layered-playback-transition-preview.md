# Layered Playback Transition Preview

## Change
- Added `getActiveTimelinePartsAtTime()` in `src/core/timeline.ts` so preview, playback, and export can share active composition stack semantics instead of resolving only one active clip.
- Updated playback part-change detection to use top-down active composition resolution, matching scrub preview behavior when stacked clips overlap or an upper clip ends while a lower clip continues.
- Updated frame preview to render active composition layers bottom-to-top while preserving object selection/editing on the top active composition.
- Updated transition preview/export to derive left/right composite inputs from the timeline state at the transition boundaries, then reveal the right composite over the left composite during the transition.
- Updated Electron video export to render all active compositions into one composite frame group before applying transition visual styles, so transition effects operate on the composite input instead of one selected clip.
- Added `getTimelinePreviewState()` in `src/core/timeline.ts` as the shared scene-time-to-preview model for active part, render stack, preview time, and transition composite inputs.
- Updated scrub-derived editor state and playback React catch-up detection to consume `getTimelinePreviewState()` instead of maintaining separate stack/transition calculations.
- Removed the frame preview's playback-only local rAF/live preview clock. Playback now advances the same render scene time that scrubbing uses, and `FramePreview` consumes the canonical `sceneTime`/`previewTime` props for both paths.
- Changed active composition stack semantics so an upper active composition fully occludes lower active compositions instead of compositing both; this matches Premiere-style video layer behavior in preview, playback, and export.
- Changed swipe transition preview/export to move the incoming whole-frame composite across the outgoing frame instead of clipping/revealing only the left portion, avoiding the hard vertical cut where the incoming frame appears at the midpoint.
- Follow-up: changed composite swipe transitions to animate outgoing and incoming whole-frame composites continuously across the full transition duration. `midPoint` remains timeline/connection metadata and no longer implies any visual time split in preview/export.

## Architecture Note
- Layer ordering remains centralized in `src/core/timeline.ts`; consumers request either `top-to-bottom` for selection/playback state or `bottom-to-top` for render order.
- `FramePreview` keeps the top composition as the editable `part`, but accepts `previewParts` as render-only stack data. This avoids threading selection/editing state through lower layers.
- Transition visual styles remain package-owned in `src/core/transitions.ts`; active transitions additionally get a D/F composite path in preview/export so all layers on each side of the transition are treated as singular inputs.
- Active preview derivation now lives in `getTimelinePreviewState()`. Future scrub, playback, presentation, and export preview decisions should call this helper instead of reimplementing active-stack, adjusted scene-time, or transition-boundary logic in UI components.
- Active stack resolution now intentionally returns only the top visible active composition. Reuse `getActiveTimelinePartsAtTime()` for render paths so lower compositions stay hidden whenever an upper composition overlaps them.
- Transition composites still resolve from `getTimelinePreviewState()`/Electron's equivalent boundary lookup, but the visual reveal should transform the incoming composite as a full frame rather than masking part of it.
- Composite transition rendering owns the frame-to-frame motion path. Do not also apply the transition package's camera transform to the composite layers, or the transition will appear to split/pivot midway.

## Verification
- `npm test -- src/core/timeline.test.ts src/core/renderRuntime.test.ts` passes.
- `rtk npm run typecheck` passes.
- Re-ran after playback/scrub unification edits: `npm test -- src/core/timeline.test.ts src/core/renderRuntime.test.ts` passes.
- Re-ran after playback/scrub unification edits: `rtk npm run typecheck` passes.
- Re-ran after occluding active composition stacks and whole-frame swipe transition edits: `npm test -- src/core/timeline.test.ts src/core/renderRuntime.test.ts` passes.
- Re-ran after occluding active composition stacks and whole-frame swipe transition edits: `rtk npm run typecheck` passes.
- Re-ran after continuous full-duration composite transition edit: `npm test -- src/core/timeline.test.ts src/core/renderRuntime.test.ts` passes.
- Re-ran after continuous full-duration composite transition edit: `rtk npm run typecheck` passes.
