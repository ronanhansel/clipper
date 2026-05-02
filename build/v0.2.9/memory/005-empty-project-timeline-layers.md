# 005 - Empty Project Timeline Layers

## Summary

Empty projects should hide timeline layers only while no timeline is selected. Once a new timeline is created or selected, the timeline panel should show its default layer rows so compositions and effects can be dragged onto them.

## Fix

- **Root Cause**: When saving/loading directory projects, `projectPersistenceService` was wrongly prepending the absolute project root path to loaded `timeline.id` and `composition.id` properties. However, UI actions like "New Timeline" and drag-and-drop generated relative paths (e.g., `timelines/New Timeline.timeline.json`). This ID mismatch meant that `App.tsx` could not match `selectedSceneId` to the loaded timelines, causing `hasActiveTimeline` to be false and the timeline to appear completely empty (no lanes).
- **Persistence Fix**: Updated `projectPathFromDirectoryEntry` to stop prepending `rootPath`. Timeline and composition IDs are now strictly project-relative (matching zip project behavior).
- **Creation Fix**: Updated `createComposition`, `createCompositionFolder`, and `createTimeline` in the File Manager actions to natively generate relative paths instead of relying on `watchedProjectDirectory`.
- **Drag Cleanup Fix**: Enhanced File Manager drag handling so it tracks when an internal Arborist drag pointer leaves the File Manager panel, and suppresses both the custom drop cursor and Arborist's native row drop styling (`willReceiveDrop`). This resolves the stale blue/default drop targets sticking around when dragging items out of the File Manager. Fixed a bug where the suppression state was not resetting when dropping non-composition items outside the panel, which previously caused hover/drag states to permanently break until the next valid drag event.
- **Historical Note**: The drag cleanup note above described the pre-NativeTree Arborist implementation. Current File Manager composition drags should not use inside/outside visual handoff or ghost suppression; see `007-native-file-effects-tree.md` for the active NativeTree drag architecture.
- **Mode Fix**: Timeline creation and selection now automatically switch the timeline panel to `composition` mode so an empty selected timeline renders the timeline lanes instead of the compose-animation panel.

## Reuse Guidance

Timeline and composition identities (`id` and `filePath`) must strictly be project-relative paths. Do not leak absolute filesystem paths into the project model, as they will break selection matching, drag-and-drop relationships, and portability.
