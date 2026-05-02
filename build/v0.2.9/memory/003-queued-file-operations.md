# 003 - Queued File Operations

## Summary

File Manager operations for v0.2.9 are expected to be queued and durable so filesystem mutations are serialized through the app's host/project workflows instead of being treated as disposable UI-only actions.

## Architecture Note

- Keep durable file mutation concerns near the File Manager and host filesystem adapter boundaries.
- UI components should request semantic operations and let the queued operation layer handle ordering, persistence, and failure reporting.
- Avoid broad project writes during transient UI interactions; commit final file operation results once each operation resolves.

## Final Safety

- Added rollback compensation to `MoveCommand` so multi-path moves reverse already-applied renames if a later rename fails. Rollback is attempted in reverse order and incomplete rollback is surfaced with an `AggregateError`.
- Hardened the project document filesystem queue with a generation counter and recovery promise. A filesystem failure advances the generation, cancels stale queued operations before they mutate disk, starts an authoritative reload, and allows later operations to proceed after recovery.
- Restored saved project and composition-source snapshots during optimistic rollback so failed implicit saves do not mark failed optimistic state as saved.
- Added targeted tests for chained optimistic path rebasing (`A -> B -> C`) and partial rollback for multi-path move failures.

## Reuse Guidance

When adding new File Manager mutations, reuse the queued operation path rather than adding direct ad hoc filesystem calls from drag, rename, create, delete, or move handlers.

## Follow-up: Background Sync Flicker

- Confirmed OS File Manager flicker after rename/move was caused by queued filesystem sync: `finishQueuedFileSystemOperation()` reloads the project, increments `fileSystemRevision`, and `OsFileManager` reloaded its tree with `loading=true`.
- `OsFileManager` now tracks the currently loaded directory and only shows the loading placeholder when switching to a new directory. Revision/refresh reloads for the same directory happen in the background and keep the optimistic tree visible until fresh data arrives.
- Keep the authoritative reload after queued operations; avoid removing the queue sync because it reconciles disk state, watcher-driven changes, and failed optimistic operations.

## Follow-up: Invalid Folder Drops

- Investigated unexpected nested `composition/composition`-style folders and found invalid folder self/descendant drops could be accepted by tree validation before snapshot persistence or filesystem rename handling.
- Unified `FileManager` drop validation now rejects dragging a folder into itself or any descendant before `applyFileManagerTreeSnapshotToProject` can persist that impossible tree shape.
- OS file-manager move handling and `MoveCommand` now defensively filter no-op and descendant moves so invalid folder drops are rejected without calling `renameFile` or surfacing filesystem errors.

## Follow-up: Rename Optimism And Drop Gaps

- OS file-manager renames now apply the optimistic tree rename before the async duplicate-name check so the row does not flash back to the old name between edit submit and filesystem command execution.
- Duplicate-name or command failures remove the pending path move and refresh/rollback from disk instead of keeping the optimistic name.
- Unified and OS file-manager drop hit-testing now maps top/bottom non-row gaps to root insertion targets, preventing the drop cursor from disappearing over padding-like dead zones around topmost folders.

## Follow-up: Packed Tree Rows

- Drop target resolution now falls back across nearby visible row edges and root insertion points when the raw target is invalid across parent boundaries. This removes the tiny non-droppable band between a top-level folder and its first child where "drop inside parent at index 0" is invalid for the current drag.
- OS file-manager root drop highlighting now follows the actual resolved drop target. Open folder row bottom bands resolve to dropping into that folder at index 0, so the folder block stays highlighted instead of switching to the whole file-manager root.
- Removed temporary debug row outlines/bands and reverted unrelated row/header visual layout experiments after confirming the issue was drop-target resolution, not row spacing.
