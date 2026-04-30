# Unify Motion Markers

## Goal
Remove the `ZoomMarker`/`TranslationMarker` split and unify all motion markers under a single `MotionMarker` type. The timeline has exactly 3 types of markers: motion, adjustment, and composition.

## Current State
- `ZoomMarker` and `TranslationMarker` are separate types extending `MotionBlock`
- `MotionMarker` already exists as a canonical unified type with `kind` discriminator
- `getMotionMarkerViews()` splits markers into `{ zoomMarkers, translationMarkers }`
- Downstream code handles zoom and translation separately everywhere (~20 files)
- Camera has separate `getActiveZoom`/`getActiveTranslation`/`getActiveRotation`/`getActivePerspective`
- UI has `ZoomInspector` vs `TranslationInspector`
- Pick states are split: `focusPickZoomMarker`, `positionPickTranslationMarker`, `trackerPickTranslationMarker`
- Motion layers have `kind: "empty" | "motion"` field

## Target State
- Single `MotionMarker` type (already exists, just remove ZoomMarker/TranslationMarker)
- `getMotionMarkerViews()` returns flat `MotionMarker[]` - no split arrays
- Camera applies markers from a single array, processing by effect kind internally
- Timeline operations use a single marker type - no zoom/translation branching
- Single inspector and motion lane for all motion effects
- Single pick state with mode (focusPicking, positionPicking, trackerPicking)
- Motion layers are just "motion" (remove `kind` field)

## Key Files
- `src/core/types.ts` - Remove ZoomMarker, TranslationMarker; keep MotionMarker
- `src/core/motionEffects.ts` - Remove split functions; add filtering helpers
- `src/core/markers.ts` - Unify mending logic
- `src/core/camera.ts` - Single loop over markers
- `src/core/timeline.ts` - Remove zoom/translation branching
- `src/core/agentContext.ts` - Use flat marker list
- `src/app/state/editorDerivedState.ts` - Remove zoom/translation derived state
- `src/app/state/editorStore.tsx` - Unify pick states
- `src/app/features/timeline/useMotionMarkerCommands.ts` - Largest file, collapse all paired functions
- `src/app/features/timeline/timelineMutationHelpers.ts` - Simplify
- `src/app/features/timeline/useTimelineProjectActions.ts` - Simplify
- `src/app/features/timeline/useTimelineClipboardCommands.ts` - Remove branching
- `src/app/features/timeline/useTimelineSelectionCommands.ts` - Simplify picks
- `src/app/features/timeline/useTimelineLayerCommands.ts` - Remove kind
- `src/app/features/timeline/useAdjustmentLayerCommands.ts` - Simplify picks
- `src/app/features/frame-interactions/useFrameInteractionController.ts` - Simplify picks
- `src/components/timeline/timelineTypes.ts` - Remove zoom/translation props
- `src/components/timeline/DirectTimelinePanel.tsx` - Single motion lane
- `src/components/timeline/MotionLane.tsx` - Simplified marker rendering
- `src/components/timeline/composeAnimationModel.ts` - Simplify
- `src/components/timeline/ComposeAnimationTimelinePanel.tsx` - Simplify
- `src/components/inspector/InspectorPanels.tsx` - Single MotionInspector
- `src/app/shell/ConnectedInspectorContent.tsx` - Simplify props
- `src/components/preview/FramePreview.tsx` - Simplify time-sensitive check
- `src/App.tsx` - Simplify threading/props

## Verification
- TypeScript compiles with `npx tsc --noEmit`
- All tests pass with `npx vitest run`
- Camera preview works for all effect kinds
- Timeline markers render correctly
