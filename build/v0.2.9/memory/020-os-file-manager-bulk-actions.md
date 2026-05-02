# OS File Manager Bulk Actions

## Summary
- Restored `Cmd+Backspace` / `Ctrl+Backspace` deletion for selected OS file-manager rows even when the tree panel itself does not have DOM focus.
- Kept the text-field shortcut guard so inline rename inputs can still use `Cmd+Backspace` without deleting files.
- Bulk delete now removes the top-level selected nodes through the queued `DeleteCommand` path without double-removing the optimistic tree state.
- Bulk delete executes as one multi-target `DeleteCommand`, so a single `Cmd+Z` restores the whole deleted selection to its previous paths.
- Context-menu delete uses the selected batch when right-clicking one of several selected rows.
- Bulk move filters selected descendants when a selected parent folder is also being moved, avoiding conflicting nested move commands.

## Architecture Notes
- `OsFileManager` mirrors the unified `FileManager` approach: a guarded window-level keydown listener handles selection shortcuts, while local row selection remains owned by `NativeTree`.
- Selection is cleared on outside pointerdown so the global shortcut only applies while the OS file-manager selection is still visibly active.
- Bulk operations continue to use the existing queued command boundary (`DeleteCommand`, `MoveCommand`) instead of direct filesystem calls.
- `DeleteCommand` now owns a list of delete targets and stable trash paths. Execute/undo/redo rename every target as one history entry, with best-effort rollback if a later rename fails.

## Verification
- `npm run typecheck` passed.
- `npx vitest run src/components/FileManager.test.ts` passed.
- `npm run typecheck` passed after multi-target `DeleteCommand` update.
- `npx vitest run src/app/features/file-manager/operations/__tests__/DeleteCommand.test.ts src/components/FileManager.test.ts` passed.
