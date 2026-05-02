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
- Reworked transition effects around an explicit sequence renderer contract: transition packages now receive `(A, B, t)` via `renderSequence()` and return styles for the outgoing `A` sequence, incoming `B` sequence, and optional transition frame wrapper. Swipe now uses this sequence path instead of a global camera transform.
- Added built-in Fade and Scale Fade transition packages using the same sequence renderer contract, so future/user-defined transitions can adapt the template by only styling the two supplied sequences.
- Transition A/B snapshots now resolve around the marker midpoint (`start + midPoint`) while `t` is still continuous over the whole transition duration. The midpoint represents the edit connection, not a visual timing breakpoint.
- Frame preview transition composites now render under a neutral parent camera and each composition layer owns its own frame style, preventing the active composition/background from snapping at the midpoint.
- Reworked transition preview/export sources so `A` and `B` are full rendered timeline sequences, including composition selection, motion, adjustment effects, backgrounds, and overlaps sampled at their own sequence times. Transition effects now sit as the top-most final compositor over those rendered frames.
- Added a constrained `transitionTime` inspector parameter for transitions. It means the time in seconds for the visual transition to finish, clamped to `0.1s..min(marker duration, 10s)`, while the marker duration can still cover the edit/sequence span.
- Corrected A/B transition sequence timing so underlying rendered frames advance by real scene elapsed time and are not slowed or remapped by `transitionTime`; only the top-most transition tween uses `transitionTime`.
- Removed effect-configurable timeline marker colors. Timeline blocks now use fixed category colors: transition uses swipe orange, motion and adjustment use the default gray, and composition keeps the default green.
- Removed `accent`, `previewColor`, and `timelineGradient` from built-in effect manifests and effect definition types. Effect packages no longer expose marker/DnD color parameters.
- Updated effect drag ghosts to use the same fixed category colors as timeline markers: transitions use swipe orange and motion/adjustment use default gray.
- Transition markers are now always symmetric: the edit/marker time is derived from the center of the block (`start + duration / 2`), drops center the marker at the target scene time, resizes expand/contract around that center, and the inspector edits `Marker time` plus `Duration` instead of a free `Mid-point`.
- Transition progress now uses the marker block duration as the natural transition time. The previous separate `transitionTime` parameter is no longer surfaced or used for runtime progress, so the length of the timeline node controls the transition speed.
- Fixed short/fast transition snapping by sampling outgoing/incoming A/B sequence frames from transition progress across each half of the symmetric marker. The incoming side no longer reaches its end frame halfway through very short transitions.
- Fixed transition ease selection so missing/default transition ease is `easeInOut`, selecting the default item persists `easeInOut` instead of clearing to a linear fallback, and transition progress now applies the selected ease.
- Transition drag/drop placement uses the pointer scene time as the block start again. Symmetry is preserved after placement, but dropping does not center the transition under the cursor.
- Added an overshooting `backOut` ease option labeled "Back out" to the shared ease picker and runtime/export easing paths.
- Restored category gradient colors for timeline nodes and drag ghosts: motion uses cyan, adjustment uses purple, transition remains orange, and composition remains green. Layer rail accents now match the same category colors.
- Motion effect drag/drop placement now uses the pointer scene time as the marker start, matching adjustment and transition markers instead of centering under the cursor.
- Fixed the motion creation command to also treat the supplied scene time as marker start; previously it still subtracted half the marker duration after the timeline drop handler passed a start time.
- Darkened the motion cyan gradient and forced white text so motion labels stay readable consistently across blocks and drag ghosts.
- Brightened the motion cyan slightly while preserving white text for readability.

## Architecture Note
- Layer ordering remains centralized in `src/core/timeline.ts`; consumers request either `top-to-bottom` for selection/playback state or `bottom-to-top` for render order.
- `FramePreview` keeps the top composition as the editable `part`, but accepts `previewParts` as render-only stack data. This avoids threading selection/editing state through lower layers.
- Transition visual styles remain package-owned in `src/core/transitions.ts`; active transitions additionally get a D/F composite path in preview/export so all layers on each side of the transition are treated as singular inputs.
- Active preview derivation now lives in `getTimelinePreviewState()`. Future scrub, playback, presentation, and export preview decisions should call this helper instead of reimplementing active-stack, adjusted scene-time, or transition-boundary logic in UI components.
- Active stack resolution now intentionally returns only the top visible active composition. Reuse `getActiveTimelinePartsAtTime()` for render paths so lower compositions stay hidden whenever an upper composition overlaps them.
- Transition composites still resolve from `getTimelinePreviewState()`/Electron's equivalent boundary lookup, but the visual reveal should transform the incoming composite as a full frame rather than masking part of it.
- Composite transition rendering owns the frame-to-frame motion path. Do not also apply the transition package's camera transform to the composite layers, or the transition will appear to split/pivot midway.
- Transition effect packages should prefer `renderSequence({ sceneTime, layer, frameRate, progress })` for page/scene-style transitions. Treat the outgoing and incoming rendered sequences as opaque full-frame pages; do not derive timing from `midPoint` inside the renderer.
- `applyTransitionLayersToVisualStyle()` remains for filters/overlays/frame effects around an active transition. It should not move the active camera for sequence transitions, because sequence motion belongs to `renderSequence()`.
- Transition sequence derivation should remain oblivious to the transition visual itself: first render full timeline A/B at their own sampled scene times, then pass those opaque frames to `renderSequence()`. New transition effects should not inspect composition internals.
- `transitionTime` replaces the old user-facing idea of "speed". Persist it in `layer.effect.params.transitionTime`; legacy `speed` is read as a fallback only.
- Current transition timing is centered and duration-driven. Reuse `getTransitionMarkerTime()` and `normalizeSymmetricTransitionLayer()` instead of reading or writing free-form `midPoint` values in new UI/runtime code.
- Do not reintroduce `timelineGradient` or other per-effect marker color metadata. Marker color is a timeline category concern, not an effect-package setting.
- DnD ghost color should also be category-derived in `ToolsPanel`; do not read effect package color fields for drag previews.

## Verification
- `npm test -- src/core/timeline.test.ts src/core/renderRuntime.test.ts` passes.
- `rtk npm run typecheck` passes.
- Re-ran after playback/scrub unification edits: `npm test -- src/core/timeline.test.ts src/core/renderRuntime.test.ts` passes.
- Re-ran after playback/scrub unification edits: `rtk npm run typecheck` passes.
- Re-ran after occluding active composition stacks and whole-frame swipe transition edits: `npm test -- src/core/timeline.test.ts src/core/renderRuntime.test.ts` passes.
- Re-ran after occluding active composition stacks and whole-frame swipe transition edits: `rtk npm run typecheck` passes.
- Re-ran after continuous full-duration composite transition edit: `npm test -- src/core/timeline.test.ts src/core/renderRuntime.test.ts` passes.
- Re-ran after continuous full-duration composite transition edit: `rtk npm run typecheck` passes.
