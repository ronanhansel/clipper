# v0.2.7 Numbered New Folders

## Summary

Updated file manager creation behavior so new compositions are silent and newly created folders use readable numbered names.

## Architecture Notes

- Creation behavior remains in `App.tsx`, where project and asset mutations are already coordinated.
- Folder numbering uses a small local helper that chooses `New folder`, then `New folder 2`, `New folder 3`, etc. from sibling names.
- Composition/project folder path names are derived from visible sibling directories under the selected parent so IDs are no longer exposed in the File Manager.
- Shared drag ghost activation lives in `src/lib/pointerDrag.ts`, which is used by both composition/file-manager drags and effect drags. Keep future drag timing changes there instead of duplicating timers in assets or tools UI.

## Status

- Removed the toast shown after creating a composition.
- Asset folders now use numbered names among sibling asset items.
- Composition folders now use numbered path segments instead of timestamp/id suffixes.
- Shared pointer drags now wait 320ms before creating the drag ghost or dispatching drag/drop events. Quick clicks on files/compositions/effects cancel before activation, preventing accidental ghosts.
- File Manager selected nodes now listen for Cmd/Ctrl+Backspace at the window capture phase, so selected assets, composition folders, compositions, or timelines can be quickly deleted even when the File Manager panel itself does not have keyboard focus. Text/editing targets are ignored.
- Cmd/Ctrl+S now checks current project/source refs directly before deciding whether there are unsaved changes. This avoids a race after editing code where `compositionSourcesRef` was dirty but the render-time `hasUnsavedChanges` value had not updated yet, causing save to return early.
- Save now refreshes composition sources by comparing the current project to the last saved project snapshot. Source sync prefers canonical composition documents/library entries over derived timeline clip copies, so interactive object moves update the saved code/source snapshot even from any screen.
- Code-pane source edits for timeline clips now validate and update `part.compositionId ?? part.id`. This fixes the error where source id `prt_*` was incorrectly compared against a timeline clip id `clip_*`, and keeps source edits tied to the canonical composition document.
- Save dirty detection and saved snapshots now use the same `serializeProjectForSave(...)` shape as persistence. Saved snapshot refs are updated synchronously after a successful save, preventing the Save button from staying dirty when serialization prunes or normalizes data differently than live project state.
- The rendered Save button dirty state in `useEditorDerivedState` now also compares `serializeProjectForSave({ ...project, compositionSources })`, matching `saveProject()` and `hasCurrentUnsavedChanges()`. This fixes the UI staying dirty even when pressing Save successfully wrote the persisted project shape.
- Cleanup: removed the redundant `hasCurrentUnsavedChanges()`/`hasUnsavedChangesRef` save-time gate from earlier attempts. `saveAllChanges()` now delegates directly to `saveProject()`, while the Save button dirty/enabled state remains the single UI gate and uses the same persisted-shape comparison as save snapshots.

## Verification

- `npm run typecheck`
- `npm test`
