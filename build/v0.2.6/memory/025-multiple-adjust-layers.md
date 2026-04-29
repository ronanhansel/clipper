# Multiple Adjust Layers

## Status

Implemented.

## Implemented

- Added optional `AdjustmentLayer.layerId` so adjustment blocks can belong to arbitrary persisted adjust rows while legacy blocks continue to use their effect id as the default row.
- Made Direct timeline adjust rows configurable like motion rows: rename, hide/show, add above/below, move up/down, remove, and drag/drop adjustment effects into a chosen row.
- Scoped hidden-adjust behavior and live preview adjustment input by adjust row id instead of effect id.
- Removing an adjust row removes its adjustment blocks from the active timeline, matching motion layer removal semantics.
- Adjustment blocks can now be dragged vertically between adjust rows; the preview uses the target row height and commit updates the block `layerId`.
- Added shared layer-row layout helpers in `src/core/timelineLayers.ts` for row hit-testing and cross-layer drag previews. Motion and adjust drags now resolve target rows and preview vertical movement through this same path.
- Adjustment lanes now switch to `overflow-visible` while an adjustment block is being moved, matching motion lane drag rendering so blocks do not disappear while crossing row boundaries.
- Added a shared `TimelineLayerLane` shell in `TimelinePanel` and routed adjust, motion, and comp lane wrappers through it so row overflow, border, background, hidden opacity, and drag/drop event surfaces stay consistent across all layer types.
- `TimelineLayerLane` intentionally does not add row-level z-index during cross-row drag. The dragged block owns its z-index; row-level stacking contexts caused blocks moving downward to render behind lower row backgrounds until drop.

## Architecture Notes

- Multiple adjust layer management follows the existing motion-layer pattern in `src/components/timeline/TimelinePanel.tsx` and persists through `editorState.timelineLayers`.
- The core row resolver is `getAdjustmentLayerRowId` in `src/core/timeline.ts`; reuse it anywhere adjustment row visibility, selection, or filtering is needed so legacy blocks stay compatible.
- Timeline rows should be treated as typed rows (`adjust`, `motion`, `comp`) via `src/core/timelineLayers.ts`; avoid adding separate row hit-test implementations for future layer kinds.
