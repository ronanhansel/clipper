# Non-Undoable Page Mode Persistence

## Summary

- Interactive/Code mode switches now go through `updateMode` in `src/App.tsx`, mirroring timeline Edit/Direct switching by writing the selected mode into `project.editorState` immediately.
- Editor-state persistence already uses `projectPersistenceService.saveEditorState`, so these page switches are implicitly saved without marking project content dirty.
- Project undo/redo now restores historical content through `preserveCurrentPageMode`, which keeps the current `editorState.mode` and `editorState.timelineMode` instead of replaying old page modes from project history.

## Architecture Notes

- Page/view selection remains editor state, not project content, because it describes the user's workspace layout rather than timeline/composition data.
- Undo history continues to store whole normalized project snapshots for content operations, but the restore boundary now explicitly preserves current page modes so view switching is not an undoable action.
- `modeRef` and `timelineModeRef` are kept current before store updates so immediate undo/redo after a shortcut or button click still preserves the latest page selection.
