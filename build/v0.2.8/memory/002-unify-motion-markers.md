# Unify Motion Markers

## Goal
Remove the `ZoomMarker`/`TranslationMarker` split and unify all motion markers under a single `MotionMarker` type. The timeline now has exactly 3 types of markers: motion, adjustment, and composition.

## Problem
The codebase maintained a dual-type model for motion markers:
- `ZoomMarker` — zoom effects (focus + scale)
- `TranslationMarker` — everything else (pan, rotate, perspective)

This discriminated union propagated through 25+ files, doubling every function, type, and component. The `getMotionMarkerViews()` function split `MotionMarker[]` into `{ zoomMarkers, translationMarkers }` and everything downstream operated on parallel arrays. Adding a new motion effect kind would require changes across the entire chain.

## Solution
Eliminated `ZoomMarker` and `TranslationMarker`. `MotionMarker` (pre-existing canonical type) is now the sole motion marker type. Effect kind is identified by the `kind: MotionBlockEffectKind` field (`"pan" | "zoom" | "rotate" | "perspective"`), driven by the effect registry — same as adjustment layers.

### Architecture
The system is now adaptive: new motion effect kinds registered in `src/core/effects/builtins/motion/` are automatically picked up without code changes beyond the manifest. The camera system dispatches behavior based on `marker.kind` from the registry, the timeline treats all markers uniformly, and the inspector renders kind-specific fields conditionally.

### Key Module Changes

#### Core types (`src/core/types.ts`)
- **Removed**: `ZoomMarker`, `TranslationMarker`
- **Kept**: `MotionBlock` (base), `MotionMarker` (canonical type with `kind` + optional effect-specific fields), `MotionBlockEffectKind`

#### motionEffects.ts
- **Removed**: `motionBlocksToZoomMarkers`, `motionBlocksToTranslationMarkers`, `isZoomMotionBlock`, `isTranslationMotionBlock`
- **Changed**: `getMotionMarkerViews()` returns flat `{ motionMarkers: MotionMarker[] }` — no more split arrays
- **Added**: `isMotionKind(marker, kind)` for kind-based filtering

#### camera.ts
- **Removed**: `getActiveZoom`, `getActiveTranslation`, `getActiveRotation`, `getActivePerspective`
- **Added**: `getActiveMarkerByKind(markers, kind, time, part?)` dispatches on effect kind
- **Added**: `getActivePerspectiveMarkers(markers, time)` for perspective accumulation
- **Changed**: `getLayeredCameraPreviewTransform` processes a single `motionMarkers` array; internally filters by kind for different transform behaviors (zoom = scale multiplicative, pan/rotate/perspective = additive)

#### markers.ts
- Renamed `normalizeMendedZoomMarkerFocus` → `normalizeMendedMotionMarkerFocus`
- Renamed `isZoomMarkerMended` → `isMotionMarkerMended`

#### timeline.ts
- **Removed**: `TimelineMarkerKind`, `getZoomMarkerLayerId`, `getTranslationMarkerLayerId`, `getZoomMarkerMendKey`, `getTranslationMarkerMendKey`, `getAvailableZoomPlacement`, `getZoomMiddleSnap`, `getSelectedZoomMiddleSnap`, `isZoomMiddleSnapActive`, `getTimelineMarkerKind`
- **Added**: Unified functions (`getMotionMarkerLayerId`, `getMotionMarkerMendKey`, `getAvailableMotionPlacement`, `getMotionMiddleSnap`, `getSelectedMotionMiddleSnap`, `isMotionMiddleSnapActive`)
- Changed function signatures to accept `MotionBlockEffectKind | undefined` instead of `TimelineMarkerKind`
- `TopTimelineItem` motion case simplified to `{ kind: "motion"; part; marker: MotionMarker }`

#### timelineMutationHelpers.ts
- Simplified `withMotionMarkers(item, motionMarkers: MotionMarker[])` — single array
- Simplified `applyMotionMarkerOverwrite` / `applySceneMotionMarkerOverwrite` — single array

#### useTimelineProjectActions.ts
- `SceneMotionMarkerUpdate` is now just `{ motionMarkers: MotionMarker[] }`
- `updateSceneMotionMarkers(updater)` receives `MotionMarker[]` directly (not `{ zoomMarkers, translationMarkers }`)

#### useMotionMarkerCommands.ts
- **Biggest change**: 762→485 lines. Collapsed 16 zoom/translation function pairs into 8 unified functions:
  - `updateMotionMarker`, `updateMotionMarkers`, `updateMotionMarkerFocusGroup`
  - `moveMotionMarker`, `moveMotionMarkers`
  - `resizeMotionMarkers`
  - `deleteMotionMarker`, `addMotionMarker`
  - `addMotionEffect` (dispatches to kind-specific creation via registry)
  - `snapMotionMiddle`, `updateMotionMiddleTransition`, `updateMotionMiddleEase`
  - `updateSelectedMotionSnap`
  - `previewMotionScale`, `clearMotionScalePreview`

#### editorDerivedState.ts
- Removed all zoom/translation derived state (`selectedZoom`, `selectedTranslation`, `absoluteZoomMarkers`, `absoluteTranslationMarkers`, etc.)
- Replaced with unified `selectedMotion` and unified snap/mend state using `getMotionMarkerMendKey`, `getMotionMiddleSnap`, `isMotionMiddleSnapActive`

#### UI Components
- **InspectorPanels**: Single `MotionInspector` component renders kind-specific fields (zoom shows focus+scale, pan shows position, rotate shows angle, perspective shows z/rotateX/rotateY) alongside common fields (ease, snap, mend, duration). Effect-powered from the registry.
- **MotionLane**: Single render loop over `motionMarkers`, filters by `layerId` and `kind`
- **DirectTimelinePanel**: Merged zoom/translation drag/resize/select into unified motion handling
- **ComposeAnimationTimelinePanel**: Uses `MotionMarker` instead of `TranslationMarker`

## Verification
- TypeScript: `npx tsc --noEmit` — zero errors
- Tests: `npx vitest run` — all 91 tests pass (7 test files)
- Camera preview works for all effect kinds (zoom, pan, rotate, perspective)
- Timeline markers render correctly for all effect kinds

## Files Changed
```
src/core/types.ts
src/core/motionEffects.ts
src/core/markers.ts
src/core/camera.ts
src/core/camera.test.ts
src/core/timeline.ts
src/core/timeline.test.ts
src/core/agentContext.ts
src/app/state/editorDerivedState.ts
src/app/state/editorStore.tsx
src/app/features/timeline/useMotionMarkerCommands.ts
src/app/features/timeline/timelineMutationHelpers.ts
src/app/features/timeline/useTimelineProjectActions.ts
src/app/features/timeline/useTimelineClipboardCommands.ts
src/app/features/timeline/useTimelineSelectionCommands.ts
src/app/features/timeline/useTimelineLayerCommands.ts
src/app/features/timeline/useAdjustmentLayerCommands.ts
src/app/features/frame-interactions/useFrameInteractionController.ts
src/components/timeline/timelineTypes.ts
src/components/timeline/DirectTimelinePanel.tsx
src/components/timeline/MotionLane.tsx
src/components/timeline/composeAnimationModel.ts
src/components/timeline/ComposeAnimationTimelinePanel.tsx
src/components/inspector/InspectorPanels.tsx
src/app/shell/ConnectedInspectorContent.tsx
src/components/preview/FramePreview.tsx
src/App.tsx
```

## Next Steps
- Consider whether `TimelineMotionLayerState.kind` field ("empty" | "motion") can be simplified further — currently unused for layer activation now that all layers are just "motion"
- The motion effect registry in `src/core/effects/builtins/motion/` can be extended with new effect kinds by adding a manifest.yml and effect package — no code changes needed above the registry layer
