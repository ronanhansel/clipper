# Project History Undo Redo

- App manifest edits now route through a central `updateProject` wrapper in `src/App.tsx`.
- User-edit history stores previous `ProjectManifest` snapshots in `projectHistoryRef`, keeps a redo stack, and caps each stack at 1000 entries.
- `Cmd/Ctrl+Z` undoes manifest edits, `Cmd/Ctrl+Shift+Z` and `Cmd/Ctrl+Y` redo them.
- Rapid consecutive project mutations are coalesced into one checkpoint, so dragging a timeline marker/object or scrubbing a numeric field restores the full pre-action state instead of stepping through tiny intermediate deltas.
- Project load and timeline viewport scroll/zoom persistence intentionally bypass history so startup and view-only state changes do not consume undo entries.
- Monaco code editor undo/redo remains native because global app undo skips `.monaco-editor` targets.
