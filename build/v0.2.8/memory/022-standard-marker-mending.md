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

## Follow-up Fix: Motion Snap/Mend Regression

User intent clarified after the marker migration:
- Motion Snap In / Snap Out are individual marker controls and must remain visible in the Motion inspector.
- Mend belongs in the same Snap inspector section, but it should only be available for multiple selected contiguous markers.
- Arbitrary single-selected/playhead-based motion mending is not allowed.
- Snap In / Snap Out should render pink edge indicators at the start/end of the motion block.
- Shift-scrub playhead snapping must include timeline-level motion markers.

Implementation notes:
- `MotionInspector` now has a `Snap` section with `Snap in`, `Snap out`, and `Mend` controls.
- `getSelectedMotionMiddleSnap` no longer returns a candidate for a single selected marker.
- Motion derived state and `snapMotionMiddle` only expose/execute mend candidates when more than one motion marker is selected.
- `getSelectedActiveMiddleMend` now requires selected markers to be in one contiguous layer run before returning active mend pairs.
- `MotionLane` renders pink snap indicators from `marker.snapIn` / `marker.snapOut`, while explicit mend edges remain cyan.
- `DirectTimelinePanel` scrub snap boundaries now include the timeline-level motion lane as well as composition-local motion markers.
- `ConnectedInspectorContent` now wires pan position/tracker pick buttons to their specific pick handlers instead of reusing focus pick.

Verification after follow-up:
- `npm run typecheck` passes
- `npm test -- src/core/timeline.test.ts src/core/timelineBlockTiming.test.ts` passes (43 tests)

## Follow-up Fix: Explicit Adjacent Motion Mending

User intent clarified further:
- New motion mends must only be allowed between selected markers that are directly adjacent in time, with no gap or overlap.
- New motion mends must only be allowed between the same marker type/effect, e.g. pan-to-pan but not pan-to-rotate.
- Moving markers close together must not recreate mends automatically; mends are explicit inspector actions only.
- Existing mended chains should still be editable from a single selected marker, including a middle marker in a chain.
- Mended groups should preview as a group while dragging, not only commit as a group on drop.

Implementation notes:
- `canMendTimelineMarkers` now requires matching effect IDs when both markers provide effect metadata, while preserving composition-style markers without effect IDs.
- `getSelectedMotionMiddleSnap` now only returns new mend candidates for contiguous selected markers whose edges are already adjacent; it no longer closes gaps by changing bounds.
- `getSelectedActiveMiddleMend` now supports single-marker active mend lookup so a selected marker inside a mended chain can expose `Unmend` in the inspector.
- Motion derived state and `snapMotionMiddle` use active-mend lookup for single selections, but still require multi-selection for creating new mends.
- Motion drag preview lookup no longer filters by the clicked marker kind, so all members of an explicit mended group receive the live transform preview.

Verification after explicit-adjacent follow-up:
- `npm run typecheck` passes
- `npm test -- src/core/timeline.test.ts src/core/timelineBlockTiming.test.ts` passes (45 tests)

## Follow-up Fix: Motion Mend Handoff Editing

User intent clarified for mended motion transition editing:
- Explicit motion mends must drive runtime handoffs; they must not depend on `snapIn` / `snapOut` flags.
- Instant mends should hand off immediately at the seam, and transition mends should interpolate smoothly into the next marker.
- The Mend ease dropdown should only show when the selected mend handoff mode is `Transition`.
- Selecting a single marker should edit all explicit mend links touching that marker. For `AB`, selecting `B` edits `AB`; for `ABC`, selecting `B` edits `AB` and `BC`, while selecting `C` edits `BC`.
- Multi-select should edit all explicit mend links touched by the selection. For `BCD` inside `ABCD`, the affected links are `AB`, `BC`, and `CD`.

Implementation notes:
- `getSelectedActiveMiddleMend` now returns all explicit adjacent pairs with either endpoint selected, for both single and multi-selection.
- `snapMotionMiddle`, middle transition mode, middle ease, and middle ease updates all reuse that touched-pair model.
- `camera.ts` now detects explicit mends using `isExplicitTimelineMarkerMend` for zoom/pan/rotate/perspective runtime handoffs instead of checking snap flags.
- Runtime mended edges keep full strength at seams for instant mode, and `middleTransition: "transition"` interpolates from the previous marker over the start of the next marker.
- The inspector receives the selected mend ease from the touched pair next-marker metadata, so selecting the previous marker in a pair still shows/edits the correct handoff ease.

Verification after handoff-edit follow-up:
- `npm run typecheck` passes
- `npm test -- src/core/timeline.test.ts src/core/timelineBlockTiming.test.ts src/core/camera.test.ts` passes (55 tests)

## Follow-up Fix: Snap/Mend Exclusivity And Motion Handoffs

User intent clarified again:
- Snap and mend are mutually exclusive at a seam.
- If `A` is mended to `B` and the user enables Snap Out on `A` or Snap In on `B`, that explicit mend is no longer active.
- If the user presses Mend on adjacent snap markers, Mend wins and clears the conflicting snap flags for the seam.
- Motion mends must suppress normal in/out ramps, so mended animation should not return to the original/default state between adjacent markers.
- Current implementation scope is motion marker handoff behavior; composition/adjustment can reuse the explicit-mend model later.

Implementation notes:
- `isExplicitTimelineMarkerMend` and `isExplicitMendedPair` now require no `snapOut` on the previous marker and no `snapIn` on the next marker.
- `updateSelectedMotionSnap` breaks the touched adjacent mend when enabling Snap In/Out, clearing paired mend IDs and transition metadata on the next marker.
- `snapMotionMiddle` clears conflicting `snapOut` / `snapIn` flags when creating a mend.
- `normalizeMendedMotionMarkerFocus` now preserves per-marker focus instead of forcing shared focus across a mended chain, leaving explicit focus-group updates to `updateMotionMarkerFocusGroup`.
- Motion runtime continues to use explicit mend detection, so instant and transition handoffs bypass ordinary snap ramp behavior when the seam is truly mended.

Verification after snap/mend exclusivity follow-up:
- `npm run typecheck` passes
- `npm test -- src/core/timeline.test.ts src/core/timelineBlockTiming.test.ts src/core/camera.test.ts` passes (56 tests)

## Follow-up Fix: Runtime Mend ID Normalization

Root cause of remaining motion handoff failure:
- Motion mends were computed in absolute timeline space using timeline-qualified marker IDs such as `__timeline_motion__:markerId`.
- Those qualified IDs were being persisted into scene motion markers.
- Runtime camera evaluation sees raw scene marker IDs, so `isExplicitTimelineMarkerMend` could not recognize the stored links and fell back to ordinary in/out ramp behavior.

Implementation notes:
- `snapMotionMiddle` now normalizes timeline-motion mend references back to raw marker IDs when writing scene motion markers.
- Timeline-qualified IDs are still used internally for selection/snap computation where they are needed to disambiguate marker identity.
- Added a regression test documenting timeline-qualified reference matching for timeline marker objects.

Verification after runtime ID normalization:
- `npm run typecheck` passes
- `npm test -- src/core/timeline.test.ts src/core/timelineBlockTiming.test.ts src/core/camera.test.ts` passes (57 tests)

## Follow-up Fix: Absolute Marker Identity Resolution

Root cause of inspector not recognizing runtime mends:
- `getAbsoluteMotionMarkers` qualifies marker IDs with `TIMELINE_MOTION_PART_ID:markerId` for selection disambiguation.
- Stored motion mend references use raw marker IDs.
- `markerIdentityKeys` only checked `marker.id` (qualified) and `partId:marker.id` (double-qualified), but never checked the raw marker ID.
- Therefore the derived state could not find active mends for the inspector, even though runtime recognized them.

Implementation notes:
- Added `rawMarkerId` to `TimelineMendMarker` type and to the `markerIdentityKeys` resolution.
- `getAbsoluteMotionMarkers` in both `useMotionMarkerCommands` and `editorDerivedState` now emit `rawMarkerId: marker.id` alongside the qualified `id`.
- Mend references are stored as raw IDs by `snapMotionMiddle` (via `normalizeTimelineMotionMendId`), and `markerIdentityKeys` now matches them.

Verification after identity resolution:
- `npm run typecheck` passes
- `npm test -- src/core/timeline.test.ts src/core/timelineBlockTiming.test.ts src/core/camera.test.ts` passes (58 tests)

## Follow-up Fix: Unmend Handoff Cleanup

Root cause of stale mend metadata after unmend:
- `snapMotionMiddle`'s bounds map only tracked `mendInId`/`mendOutId`, not `middleTransition`/`middleEase`.
- Unmending cleared the mend references but left transition/ease metadata on the next marker.
- This caused stale handoff mode/ease values to persist after unmend, and could confuse subsequent mend operations.

Implementation notes:
- `nextBounds` map now tracks `middleTransition` and `middleEase`.
- Unmend path now clears `middleTransition: undefined` and `middleEase: undefined` on the next marker.
- Write-back now includes `middleTransition` and `middleEase` from bounds.
- Added a regression test for timeline-qualified ID matching with `rawMarkerId`.

## Follow-up Fix: Scene Marker Write-back

Root cause of unmend (and any scene-level motion marker mutation) being silently ignored:
- `updateSceneMotionMarkers` wrote motion marker changes only to `project.timelines`.
- The app reads motion markers from `project.scenes` via `editorDerivedState`.
- These are two separate project arrays — the write went to a location that is never read by the editing UI.
- All scene-level motion marker mutations (mend, unmend, snap toggle, transition, ease, focus group, add/delete) were effectively no-ops for the displayed state.

Fix:
- `updateSceneMotionMarkers` now writes to both `project.scenes` and `project.timelines`, preserving the existing timeline entry format alongside the scene format.
- Also fixed the 2-marker unmend selection to only preserve the currently selected markers rather than expanding to both pair members.

## Follow-up Fix: Params Shadowing In Marker Normalization

Root cause of mutations (mend, unmend, transition, ease, snap toggle) silently reverting:
- `MotionBlock` has both top-level fields (`mendInId`, `middleTransition`, etc.) and `params: MotionBlockParams` with the same keys.
- `normalizeMotionBlocks` resolves via `block.mendInId ?? params.mendInId` — so if a mutation only cleared the top-level field but `params` still held the old value, the value was restored.
- Every read via `getCanonicalMotionMarkers` went through this fallback, silently reverting all mutations.
- Combined with `updateSceneMotionMarkers` only writing to `project.timelines` (not `project.scenes`), nested params shadowing caused complete write-through failure.

Fixes:
- `updateSceneMotionMarkers` now writes to `project.scenes` alongside `project.timelines`.
- `snapMotionMiddle` write-back now syncs `params` fields with the updated mend metadata.
- `applySnapToggle` (snap flag changes) clears corresponding `params` fields when breaking mends.
- `updateMotionMiddleTransition` and `updateMotionMiddleEase` sync `params.middleTransition`/`params.middleEase`.
- Added `clearMendParams` helper for consistent params synchronization.
