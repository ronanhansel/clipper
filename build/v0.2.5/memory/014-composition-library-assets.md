# Composition Library Assets

- Work started to separate reusable composition source files from timeline composition instances.
- Goal: show compositions in their own section inside the Assets tab, keep imported assets separate, and make timeline deletion remove only the timeline instance while leaving the composition file/library entry intact.
- Architecture direction: project state should track a composition library in the manifest, while scenes reference/instantiate those library entries. File-manager operations for composition files should remain explicit host actions rather than undoable timeline edits.
- Implemented `ProjectManifest.compositionLibrary`, normalized legacy projects by seeding the library from scene compositions, and updated persistence/source loading to read and save unique library + timeline composition files.
- `FileManager` now renders a dedicated Compositions section above imported assets. Entries can be dragged to the timeline, double-clicked to add, created, renamed, duplicated, revealed in Finder, copied by path, or moved to Bin.
- Timeline Backspace/Delete on a selected composition now removes it only from the current scene timeline, keeps the composition library/file intact, and remains undoable through the existing project history stack.
- Electron host bridge gained reveal/trash/rename/copy file helpers; text writes now create parent directories so newly-created library composition files under `assetsPath/compositions` save cleanly.
- Verification: `npm run typecheck` and `npm test` both pass.
- Follow-up: the Assets tab now uses two separate dotted cards. The composition manager is its own file-backed tree above imported assets, supports folder creation/rename/delete/move using host filesystem operations, and stores `ProjectManifest.compositionFolders` only so empty composition directories remain visible in the UI.
- Follow-up: renamed the composition card to File Manager, scoped its displayed tree to the active project folder instead of the broader `clipper/` hierarchy, and matched its row density/icon sizing to the File Manager card.
