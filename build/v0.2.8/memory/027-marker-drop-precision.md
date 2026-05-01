# Marker Drop Precision & Configurable Timeline Precision

## Problem
1. When moving markers/layers in the timeline, dropping them caused displacement due to hardcoded rounding (`roundTwo` to 0.01s, `roundTenth` to 0.1s) being applied in both preview and commit paths.
2. Position precision was hardcoded with mixed conventions (some 2-decimal, some 1-decimal), offering no configurability and inconsistent behavior across block types.

## Root Cause
Multiple hardcoded rounding functions were scattered across the codebase:
- `roundTwo` (0.01s) in motion marker move/resize, `getTimelineBlockTiming`, `placeMotionMarkerOnTimeline`
- `roundTenth` (0.1s) in composition/adjustment/transition move/resize, clipboard paste, inspector fields, new marker creation
- No centralized precision control

## Fix

### Unified precision approach
- **Single rounding function for positioning**: All timeline positioning now uses `roundToPrecision(value, timelinePrecision)` where `timelinePrecision` is a user-configurable setting.
- **Default precision**: 3 decimal places (0.001s), defined in `config.ts` as `defaultTimelinePrecision = 3`.
- **Settings UI**: Settings > Timeline > "Position precision" control (range: 1–6 decimal places).

### Files changed

#### Core utilities
- `src/core/math.ts` — Added `roundToPrecision(value, decimals)`; `roundTwo` now delegates to it.
- `src/core/types.ts` — Added `timelinePrecision` to `EditorState`.
- `src/app/config.ts` — Added `defaultTimelinePrecision = 3`.

#### Store & wiring
- `src/app/state/editorStore.tsx` — Added `timelinePrecision` state, setter, and initialization from project.
- `src/App.tsx` — Destructures `timelinePrecision` from store; passes it to all command hooks and timeline panel; replaced `roundTenth` in `moveTransitionLayer` and `addTransitionLayerAt`.
- `src/app/shell/AppDialogs.tsx` — Wired `timelinePrecision` through to `SettingsDialog`.

#### Settings UI
- `src/components/SettingsDialog.tsx` — Added "Position precision" input with reset button.

#### Timeline core
- `src/core/timelineBlockTiming.ts` — `getTimelineBlockTiming` accepts `precision` parameter; resize actions use it, move action keeps `start` unrounded.
- `src/core/timeline.ts` — `resizeTimelineMarkersWithPush` and `resizeTimelineMarkerFreely` accept `precision` parameter.

#### Timeline panel (drag-and-drop)
- `src/components/timeline/DirectTimelinePanel.tsx` —
  - Threaded `timelinePrecision` through all block interaction configs.
  - `startBlockPointerInteraction` passes `precision` to `getTimelineBlockTiming`.
  - Replaced ALL `roundTenth` in move/resize commit callbacks for compositions, adjustments, transitions with `roundToPrecision(..., timelinePrecision)`.
  - Replaced `roundTenth`/`roundTwo` in transition `transformTiming` with `roundToPrecision(..., timelinePrecision)`.
  - Replaced `roundTenth` in new marker/layer creation with `roundToPrecision(..., timelinePrecision)`.
  - `getTimelineMarkerResizeCommits` uses `timelinePrecision`.
- `src/components/timeline/timelineTypes.ts` — Added `timelinePrecision` to `TimelinePanelProps`.

#### Command hooks
- `src/app/features/timeline/useMotionMarkerCommands.ts` — Added `timelinePrecision` prop; replaced `roundTwo`/`roundTenth` in `moveMotionMarker`, `moveMotionMarkers`, `resizeMotionMarkers`, `addMotionMarker`, `snapMotionMiddle`.
- `src/app/features/timeline/timelineMutationHelpers.ts` — Removed `roundTwo` from `placeMotionMarkerOnTimeline`.
- `src/app/features/timeline/useAdjustmentLayerCommands.ts` — Added `timelinePrecision` prop; replaced `roundTenth` in `moveAdjustmentLayer` and `snapAdjustmentMiddle`.
- `src/app/features/timeline/useCompositionTimelineCommands.ts` — Added `timelinePrecision` prop; replaced `roundTenth` in `moveCompositionMarker`, `moveCompositionMarkers`, `updateCompositionMarker`, `addCompositionFromLibrary`, `snapCompositionMiddle`.
- `src/app/features/timeline/useTimelineClipboardCommands.ts` — Added `timelinePrecision` prop; replaced `roundTwo`/`roundTenth` in paste logic for all node types.

## What was NOT changed (intentionally)
- `InspectorPanels.tsx` manual input rounding — left for other agents who may be working on inspector UI.
- `TimelineShell.tsx` tick/zoom display rounding — display-only, not positioning.
- `core/timeline.ts` snap boundary edge comparisons (`getMovingMarkerEdgeTimes`) — used only for snap exclusion logic.
- `core/timelineOverwrite.ts` marker split logic — complex overwrite behavior best left for dedicated refactor.

## Persistence
- `timelinePrecision` is stored in `EditorState.timelinePrecision` and persisted with the project.
- Rounding still happens on project save via `sanitizeProjectNumbers` in `math.ts` (uses `roundTwo` for backward compatibility of persisted data).
