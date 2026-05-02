# 017 - Missing Composition Media Relink

## Change

- Preserved timeline composition markers when backing composition files are deleted, moved outside expected paths, or otherwise missing from disk.
- Missing compositions now render as grey timeline markers with a red inner border instead of disappearing from the timeline structure.
- Added a File Manager-owned "Find media in project" dialog that pre-fills the missing filename, allows editing it, supports Enter-to-find, and relinks the composition by searching inside the project folder.
- Right-clicking a missing composition marker can request the same File Manager find-media dialog.
- Find-media requests are stored briefly in `src/lib/fileManagerEvents.ts` and consumed by app-level dialog state in `App.tsx`, so the confirmation popup opens after context-menu teardown even when the File Manager pane is hidden or replaced by the OS file manager.
- Missing markers show the normal filename without a redundant `Unlinked:` prefix, with a thinner 1px red inner border.
- Timeline context-menu `Cut` no longer shows a toast; keyboard cut still uses the existing shortcut feedback.
- The find-media dialog now edits only the base composition name and renders `.composition.ts` as a fixed suffix to the right of the text field.
- Find-media search is case-insensitive, has a renderer fallback through `listDirectory`, and searches the entire project `file-manager` tree first before falling back to broader legacy roots.
- Successful relink now updates all missing composition library entries and timeline clips that refer to the same missing composition filename, so duplicate missing markers are restored together.
- Relink also handles missing timeline dependencies that have no matching composition library entry by creating the restored library entry from the found source.
- Missing markers now use only the greyed-out fill; the red inner border was removed.
- Relink parses the found composition source with `compositionFromSource` before updating project state, so restored markers use the actual background/elements/objects instead of remaining placeholder-empty and dark.
- Relinking updates the composition path/source and remaps timeline clip references through the existing composition library mutation flow.
- Hardened file rename commands to ensure the destination parent folder exists before host rename calls.

## Architecture Note

- Missing composition state lives in canonical project data via `sourceMissing` on `CompositionClip`; timeline rendering consumes normalized placeholder parts rather than deleting timeline clips.
- The File Manager remains the owner of the find-media UI and relink action. Timeline context menus communicate with it through the narrow `src/lib/fileManagerEvents.ts` event instead of threading dialog state through timeline props.
- Directory persistence keeps missing composition metadata in `project.json` and skips writing absent source files until a relink restores the source.

## Verification

- `rtk npm run typecheck` passes.
- `npm test -- src/core/project.test.ts src/components/FileManager.test.ts` passes.
