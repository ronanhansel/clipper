## Standard Marker Mending

Work completed to standardize timeline marker behavior so mending is a shared marker capability rather than motion-specific behavior.

User intent:
- All timeline markers should behave consistently.
- The only allowed behavioral difference should be explicit mending support, controlled by effect manifest metadata.
- Mending is grouping adjacent markers in the same layer; it should apply to two or more neighboring markers.
- Snapping is separate optional marker metadata and should not be hard-coded to motion semantics.
- Composition and adjustment snapping remain unsupported for now; inspector UI should allow mending only where applicable and disable unsupported snapping controls.

## Implementation

### Core Infrastructure (src/core)
- `EffectManifestTag = "blocksMending"` added to `src/core/types.ts`
- `TimelineMarkerMetadata` (mendInId, mendOutId, snapIn, snapOut) on `MotionBlock`, `AdjustmentLayer`, `CompositionClip`
- `effectBlocksMending(effectId)` added to `src/core/effects/registry.ts`
- `canMendTimelineMarkers(prev, next)` in `src/core/timeline.ts` - works with both `effectId` and `effect.effectId` shapes
- `getTimelineMarkerMendLayerId(marker)` - resolves layer identity from both `layerId` and `effect.effectId`
- `isTimelineMarkerMendedEdge` replaces MotionLane duplicate; uses shared core logic
- `isExplicitTimelineMarkerMend` no longer requires `snapIn`/`snapOut`; requires adjacency + mend IDs
- `getMendedMarkerDragItems` uses `effectBlocksMending` instead of motion kind
- Middle-mend candidate detection (`getMotionMiddleSnap` etc.) checks `canMendTimelineMarkers`
- `resizeTimelineMarkersWithPush` enforces adjacency for drifted references
- `speedChange` manifest has `tags: ["blocksMending"]`

### Motion Mending (existing, cleaned up)
- Motion inspector: Mend/Unmend button only; snap toggle controls removed
- Mending command no longer writes `snapIn`/`snapOut` flags
- MotionLane uses shared `isTimelineMarkerMendedEdge` from core

### Adjustment Mending (new)
- `adjustedMarkers` derived state computes middle-mend candidates via `getSelectedActiveMiddleMend` / `getMotionMiddleSnap`
- `snapAdjustmentMiddle` in `src/app/features/timeline/useAdjustmentLayerCommands.ts`
- `AdjustmentInspector` displays Mend button gated by `canSnapMiddle`
- Uses `updateSceneAdjustmentLayers` with `applyAdjustmentLayerOverwrite`

### Composition Mending (new)
- `compositionMarkers` derived state computes middle-mend candidates
- `snapCompositionMiddle` in `src/app/features/timeline/useCompositionTimelineCommands.ts`
- `FrameInspector` displays Mend button gated by `canSnapMiddle`
- Uses `updateSceneParts` with `rebaseCompositionTimelineMarkers`

### Timing Unification (previous pass)
- Motion move uses `getTimelineBlockTiming` instead of handwritten snap/clamp
- Motion resize uses `selectedMotionResizeTargets` (same pattern as adjustment)
- Motion move falls back to source layer (same as adjustment)

## Files Changed
- `src/core/types.ts` - TimelineMarkerMetadata, EffectManifestTag
- `src/core/timeline.ts` - canMendTimelineMarkers, isTimelineMarkerMendedEdge, exported TimelineMendMarker
- `src/core/markers.ts` - uses canMendTimelineMarkers, adjacency in isExplicitMendedPair
- `src/core/effects/registry.ts` - effectBlocksMending
- `src/core/effects/builtins/adjustments/speedChange/manifest.yml` - tags: ["blocksMending"]
- `src/core/timeline.test.ts` - cross-kind mending, adjacency, manifest blocking tests
- `src/components/timeline/MotionLane.tsx` - uses shared isTimelineMarkerMendedEdge
- `src/components/timeline/DirectTimelinePanel.tsx` - timing unification, resize target fix
- `src/components/inspector/InspectorPanels.tsx` - Mend in MotionInspector, AdjustmentInspector, FrameInspector
- `src/app/state/editorDerivedState.ts` - adjustment/composition middle-mend candidates
- `src/app/features/timeline/useMotionMarkerCommands.ts` - no snap flag writes on mend
- `src/app/features/timeline/useAdjustmentLayerCommands.ts` - snapAdjustmentMiddle
- `src/app/features/timeline/useCompositionTimelineCommands.ts` - snapCompositionMiddle
- `src/app/shell/ConnectedInspectorContent.tsx` - wire new props
- `src/App.tsx` - wire derived state and commands

## Verification
- `npm run typecheck` passes
- `npm test -- src/core/timeline.test.ts src/core/timelineBlockTiming.test.ts` passes (43 tests)
