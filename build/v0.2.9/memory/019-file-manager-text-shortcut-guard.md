# File Manager Text Shortcut Guard

## Summary
- Prevented file-manager shortcuts from running while focus is inside text-editing controls, including the inline rename input.
- Specifically protects common text editing shortcuts such as `Cmd+Backspace` / `Ctrl+Backspace` from deleting selected file-manager nodes while renaming.

## Architecture Notes
- `FileManager` now reuses the shared `isTextEditingTarget` helper from `src/app/features/shortcuts/useGlobalEditorShortcuts.ts` instead of maintaining a duplicate input/textarea/select/contenteditable check.
- The guard is exposed as `shouldSkipFileManagerShortcut` for focused unit coverage and to keep future file-manager shortcut checks consistent.
- Range inputs remain shortcut-eligible to preserve existing non-text input behavior from the shared shortcut helper.

## Verification
- Added `FileManager.test.ts` coverage for text input and range input shortcut guard behavior.
- The focused guard test uses minimal DOM constructor stubs because the existing Vitest setup runs in Node, not jsdom.
- The stubs implement the `EventTarget` methods required by TypeScript while keeping the test isolated from a browser environment.

## Follow-up: OS Rename Double Submit
- Fixed an OS file-manager rename race where pressing `Enter` could submit the inline rename and then `blur` could submit the same edit again before edit mode cleared.
- The second async `RenameCommand` could hit `ENOENT` because the first command had already moved the file successfully.
- `OsFileTreeNode` now tracks whether the current edit session was submitted or cancelled and ignores later blur/keydown submissions for that same session.

## Follow-up: OS Text Shortcut Guard
- The OS file manager had its own `Cmd/Ctrl+Backspace` delete shortcut separate from the unified `FileManager` shortcut handler.
- `OsFileManager.handleKeyDown` now skips shortcuts when the event target is a text-editing control via the same shared `isTextEditingTarget` helper.
- This protects inline OS file rename inputs from deleting the selected file when users press `Cmd+Backspace` to clear text.
