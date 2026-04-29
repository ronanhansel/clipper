# Implicit Editor State Persistence

## Goal

Persist editor-only viewport state automatically so layout/positioning choices survive reloads without making the project appear unsaved.

## Architecture Note

Editor viewport state belongs in `ProjectManifest.editorState`, normalized by `src/core/project.ts` and updated from `src/App.tsx`. These updates should use non-history app-state writes and keep the saved project snapshot aligned so transient UI persistence does not enable the save button.

Future editor-only state should be added to `EditorState` and written through the same implicit update path rather than mixed into content mutation flows.

## Implemented

- `EditorState` now includes app mode, panel tabs, selected scene/time, and middle preview scale/scroll/zoom-control openness.
- `App.tsx` excludes `editorState` from the dirty comparison, so editor-only state does not light up the save button.
- `projectPersistenceService.saveEditorState` updates only the manifest metadata so implicit editor persistence does not write unsaved composition/content changes.
- The preview zoom button only toggles the controls and no longer resets preview zoom or scroll when pressed again.
- Playhead time is explicitly committed to editor state when scrubbing settles, playback pauses, and playback reaches the end, so the restored player head follows the last visible position.
- File Manager operations are implicit saves: they update the saved snapshot and persist shortly after create/delete/rename/move/sort. History entries created by these operations carry `implicitFileOperation`; undo/redo of those entries must also realign the saved snapshots and persist, so undoing a file delete does not light the Save button.
