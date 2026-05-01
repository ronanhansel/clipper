# Code Scroll Position

## Goal

- Persist the Monaco code editor scroll position implicitly for each composition source file.
- Restore the saved scroll position when switching between interactive and code mode or moving between files.

## Architecture Note

- Store per-file code viewport state under `ProjectManifest.editorState` so it is saved with normal editor state persistence.
- Keep Monaco-specific scroll capture and restore in `CodePane`; route only plain `{ scrollLeft, scrollTop }` data through `App`.

## Implementation

- Added `CodeViewportState` and `editorState.code`, normalized with other project editor state.
- `CodePane` rAF-throttles Monaco scroll events, saves a final position on unmount, and restores the saved position on mount.
- `App` passes the active file's viewport state by `part.filePath` and keys the code pane by file path so each file restores independently.
- Follow-up fix: keep the latest Monaco scroll position synchronously in a ref and restore in multiple post-layout passes, because Monaco can reset scroll after the first mount-time restore.
- Second follow-up: keep `CodePane` mounted while switching between Interactive and Code, hide it instead of disposing Monaco, and maintain an in-memory per-file cache as the immediate source of truth while still writing to `editorState.code` for persistence.
- Third follow-up: avoid `display: none` for the hidden code pane and cache Monaco `saveViewState()` per file, restoring it with `restoreViewState()` when the code pane becomes active again.

## Verification

- `npm run typecheck`
- `npm test`
