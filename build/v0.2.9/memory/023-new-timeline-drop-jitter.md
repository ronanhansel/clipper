# New Timeline Drop Jitter

## Change

- Fixed inconsistent composition drag-over handling on direct timeline composition lanes by routing lane drag-over through the same target resolver as the viewport drag-over handler.
- Aligned editor derived timeline state with the active `TimelineDocument.timelineLayers` instead of falling back to legacy `project.editorState.timelineLayers`.
- This keeps fresh timelines, which may only have local/default layer state, using the same row model for preview, selection, blocking, and drop calculations.
- Reverted the file-manager ghost/drop-fallback experiment; the file-manager drag bridge was not the root cause and should stay on its previous behavior.
- Removed per-move coordinates from direct timeline external preview remount checks. Drag previews should mount once per semantic preview target and then update position imperatively via rAF.

## Architecture Note

- Timeline row layout is timeline-local state. Shared derived editor calculations should receive the active timeline layer state from `App.tsx` rather than independently reading legacy editor state.
- Composition native drag/drop should use one target-resolution path so the lane and viewport do not alternately accept/reject the same drag.
- External composition/effect timeline previews live in `DirectTimelinePanel`; avoid remounting the preview component for coordinate-only changes, because remounting during native drag hover can cause visible shiver and unstable drop hit-testing.

## Verification

- `rtk npm run typecheck` passes.
- `rtk npm run typecheck` passes after reverting the file-manager experiment and stabilizing direct timeline preview remounts.
