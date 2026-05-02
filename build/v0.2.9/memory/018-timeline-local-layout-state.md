# 018 - Timeline Local Layout State

## Change

- Moved timeline layout state (`timelineLayers`, layer names, hidden/locked flags, row heights) from global `project.editorState.timelineLayers` into each `TimelineDocument.timelineLayers`.
- New timelines are created with fresh default layer layout in their own timeline file, so deleting the active timeline and creating a new one no longer restores old layer counts/names/sizes.
- Timeline layer mutations now write to the active timeline document instead of editor state.
- Project normalization migrates legacy global editor timeline layout into existing timelines once, then removes the global layout state from normalized editor state.
- Save-time stale adjustment pruning now uses each timeline's local layout state.

## Architecture Note

- Timeline-specific inputs/layout belong in `TimelineDocument` because timeline files are the durable source of truth for layer rows and marker placement.
- `EditorState` should retain app/editor viewport and selection concerns only; `timelineLayers` is now legacy fallback data and should not be written by new mutations.

## Verification

- `rtk npm run typecheck` passes.
- `npm test -- src/core/project.test.ts src/app/features/file-manager/compositionLibraryMutations.test.ts` passes.
