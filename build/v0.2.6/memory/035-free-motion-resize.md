## Free Motion Resize

- Motion block resize no longer uses push/no-overlap layout. Dragging a zoom, pan, rotate, or perspective edge now only changes the dragged or selected block.
- Added `resizeTimelineMarkerFreely` in `src/core/timeline.ts` for scene-bounded, minimum-duration edge resize without moving neighboring markers or mended blocks.
- `TimelinePanel` now uses free resize for scene-absolute motion resize previews and commits, eliminating opposite-edge growth artifacts when resizing across composition boundaries or other motion blocks.
- `normalizeMotionBlocks` no longer clamps motion block `start` to `>= 0`. Single-span motion blocks can use negative relative starts on their owning composition when they visually extend across the previous composition boundary.
- Motion move placement and free resize now commit at hundredth-second precision (`roundTwo`) instead of tenth-second precision, matching project normalization and reducing visible drop-time jumps after pixel-precise drag previews.

Architecture note: keep constrained push resize and composition-local start clamping out of motion block interactions unless explicitly requested again. Motion and adjustment blocks should behave as independent scene-spanning blocks; shared block DOM remains in `TimelineBlock`, and motion resize math should stay free/single-target.
