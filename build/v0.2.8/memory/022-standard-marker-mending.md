## Standard Marker Mending

This feature standardizes timeline marker mending (explicit adjacent linking), snap/mend
exclusivity, mend handoff editing, and unifies the project timeline/scene data model so that
`project.timelines` is the single source of truth.

---

### Architecture Decisions

**Single source of truth** — `project.timelines` carries the canonical `motionMarkers`,
`adjustmentLayers`, and `clips`. `project.scenes` is derived by `normalizeProject()` on load/save
only. All editing mutations write exclusively to `project.timelines`. Runtime reads use
`getSceneFromProject(project, sceneId)` which resolves timeline clips against the composition
library. This eliminates the previous dual-write pattern where mutations had to sync two separate
arrays.

**Why `getSceneFromProject` instead of using `project.scenes` everywhere:**
- `getSceneFromProject` resolves composition data from `project.timelines` + `project.compositions`
  + `project.compositionLibrary` + `project.compositionSources` on-demand.
- `useMemo(() => getSceneFromProject(project, selectedSceneId), [project, selectedSceneId])` in
  `editorDerivedState` ensures it only recomputes when the project changes.
- Inside `updateProject` callbacks, `getSceneFromProject(current, scene.id)` gives the latest
  state derived from the just-mutated timelines — no stale scene data.

**Params shadowing** — `MotionBlock` has both top-level fields (`mendInId`, `middleTransition`,
etc.) AND `params: MotionBlockParams` with the same keys. `normalizeMotionBlocks` resolves via
`block.field ?? params.field`, so mutating only the top-level field leaves the old value in params.
All mend-related mutations now sync `params` via the `clearMendParams` helper.

**Marker identity resolution** — Timeline motion markers use timeline-qualified IDs
(`__timeline_motion__:markerId`) internally for selection disambiguation but store raw IDs in
`mendInId`/`mendOutId`. `markerIdentityKeys` checks raw ID, qualified ID, and `rawMarkerId` field
so both the editor (qualified selection) and runtime (raw marker evaluation) recognize the same
mend links.

**Snap/mend exclusivity** — `isExplicitTimelineMarkerMend` requires NO `snapOut` on the previous
marker and NO `snapIn` on the next. Enabling Snap In/Out on a mended marker breaks the adjacent
mend and clears transition metadata on the next marker. Pressing Mend on adjacent snap markers
clears conflicting snap flags so Mend wins.

---

### Core Infrastructure (`src/core/`)

| File | What was added / changed |
|---|---|
| `src/core/types.ts` | `TimelineMarkerMetadata` (mendInId, mendOutId, snapIn, snapOut) on MotionBlock, AdjustmentLayer, CompositionClip. `EffectManifestTag = "blocksMending"`. |
| `src/core/timeline.ts` | `canMendTimelineMarkers` (same effect kind requirement). `isExplicitTimelineMarkerMend` (excludes active snap flags). `isTimelineMarkerMendedEdge`. `getSelectedActiveMiddleMend` (supports both single and multi selection). `getSelectedMotionMiddleSnap` (adjacent-only candidate detection). `markerIdentityKeys` (includes `rawMarkerId`). `getTimelineMarkerMendLayerId`. `TimelineMendMarker` type. |
| `src/core/markers.ts` | `isMotionMarkerMended`, `getMendedMarkerIds`, `isExplicitMendedPair`. `normalizeMendedMotionMarkerFocus` REMOVED (was dead no-op). |
| `src/core/camera.ts` | Runtime handoff uses `isExplicitTimelineMarkerMend` instead of `snapIn`/`snapOut` for zoom/pan/rotate/perspective. Instant mends hand off at seam; transition mends interpolate via `middleTransition`/`middleEase`. |
| `src/core/project.ts` | `getSceneFromProject(project, sceneId)` — derives a Scene from timelines + composition docs. `getCompositionDocuments` exported. Deprecation comments on `getScenesFromTimelines` and `scenes` field. `remapMovedMarkerMendIds` syncs params. |
| `src/core/effects/registry.ts` | `effectBlocksMending(effectId)`. |
| `src/core/effects/builtins/adjustments/speedChange/manifest.yml` | `tags: ["blocksMending"]`. |

### App / Feature Modules (`src/app/`)

| File | What was added / changed |
|---|---|
| `src/app/features/timeline/useMotionMarkerCommands.ts` | `snapMotionMiddle` (mend/unmend), `updateMotionMiddleTransition`, `updateMotionMiddleEase`, `updateSelectedMotionSnap` (breaks adjacent mends), `clearMendParams` helper, `normalizeTimelineMotionMendId`. Motion mends created only for adjacent same-effect markers with two or more selected. Unmend from single-selected markers in a chain works. |
| `src/app/features/timeline/useTimelineProjectActions.ts` | `updateSceneMotionMarkers` writes only to `project.timelines` (not scenes). `updateSceneParts` and `updateCompositionForTimelinePart` derive from timelines via `getSceneFromProject`. |
| `src/app/features/timeline/useTimelineLayerCommands.ts` | Uses `getSceneFromProject` in `removeMotionLayer` for composition marker cleanup. |
| `src/app/state/editorDerivedState.ts` | Scene derived from `getSceneFromProject(project, selectedSceneId)` via `useMemo`. `selectedMotionPartMiddleEase` computed from touched mend pairs. `getMiddleEase` helper. |
| `src/app/shell/ConnectedInspectorContent.tsx` | Wires `onStartMotionPositionPick`, `onStartMotionTrackerPick`, `middleEase` prop. |
| `src/app/state/editorStore.tsx` | Initial scene ID from `project.timelines?.[0]?.id`. |
| `src/app/project/projectSources.ts` | Removed stale `project.scenes` reference. |
| `src/app/project/useProjectDocumentController.ts` | Uses `project.timelines?.[0]?.id`. |
| `src/app/features/file-manager/timelineLibraryMutations.ts` | `project.scenes.length` fallback → `0`. |

### Components (`src/components/`)

| File | What was added / changed |
|---|---|
| `src/components/inspector/InspectorPanels.tsx` | MotionInspector `Snap` section with Snap in, Snap out, Mend. Mend handoff controls (Instant/Transition + ease dropdown). Ease hidden for Instant mode. `motionEaseSelectValue` explicit param for Mend ease. |
| `src/components/timeline/MotionLane.tsx` | Pink edge indicators for `snapIn`/`snapOut`. Cyan indicators for explicit mends. |
| `src/components/timeline/DirectTimelinePanel.tsx` | Scrub snap boundaries include timeline-level motion markers. Live drag preview for mended groups (no kind filter). |

### Tests

| File | What was added |
|---|---|
| `src/core/timeline.test.ts` | Adjacent-only candidate selection, gap rejection, same-type-only mending, single-marker active mend detection with timeline-qualified IDs, snap/mend exclusivity. 58 timeline tests total. |
| `src/core/camera.test.ts` | Explicit-mend instant/transition handoff tests. |

---

### Verification

```sh
npm run typecheck    # clean
npm test             # 102 tests passing (7 test files)
```

### How to extend

- **Adding mending for a new motion effect**: ensure the effect has a consistent `effectId` (set in
  manifest). `canMendTimelineMarkers` requires matching effect IDs. If the effect should NOT be
  mendable, add `tags: ["blocksMending"]` to its manifest.
- **Adding mending for compositions / adjustment layers**: reuse `TimelineMarkerMetadata` and
  `isExplicitTimelineMarkerMend`. The infrastructure (`getSelectedActiveMiddleMend`, `nextBounds`,
  write-back pattern) is already generic. Each type needs its own `snap*Middle` command (motion
  has one, composition and adjustment have stubs).
- **Adding a new mend-related marker field**: add it to `TimelineMarkerMetadata`, `MotionBlock`,
  and `MotionBlockParams`. Then add it to the `clearMendParams` helper and `nextBounds` map in
  `snapMotionMiddle`. All mutation paths will follow the same pattern.
