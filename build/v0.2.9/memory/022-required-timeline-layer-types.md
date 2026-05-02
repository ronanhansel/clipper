# Required Timeline Layer Types

## Summary
- New timelines now default to one blank row for every available timeline layer category: composition, adjustment, motion, and transition.
- Legacy or deprecated timeline documents missing one or more category arrays are normalized with the missing default rows before being rendered or saved.

## Architecture Notes
- `defaultTimelineLayerState` in `src/core/project.ts` remains the single source of truth for available timeline layer categories and their default rows.
- `withRequiredTimelineLayerTypes` derives required categories from array keys in that default state, so adding a future category should only require extending the default state and the relevant type/UI plumbing.
- Raw OS File Manager timeline creation in `src/components/OsFileManager.tsx` writes full timeline documents instead of `{ clips: [] }`, so newly created `.timeline.json` files are immediately portable and self-contained.
- Directory project loading repairs deprecated `.timeline.json` files on disk when their `timelineLayers` object is missing one or more required category arrays.
- Manually repaired `clipper/projects/hi/file-manager/New Timeline.timeline.json` by adding the default `timelineLayers` object so the timeline has composition, adjustment, motion, and transition rows on disk.
- Added `createDefaultTimelineLayerState()` in `src/core/project.ts` and switched project/OS timeline creation to use it, so every new timeline gets independent default composition, adjustment, motion, and transition rows. Load-time repair continues to call `withRequiredTimelineLayerTypes()` before returning directory timelines, ensuring missing or empty categories are populated before the app renders them.
- Fixed directory timeline synchronization: `loadDirectoryTimelines()` now imports every `.timeline.json` under the editable `file-manager` tree, not only files inside `file-manager/timelines/`. This prevents the OS File Manager from selecting a visible timeline file that is absent from `project.timelines`, which made drops call `onAddComposition` but mutate no matching timeline.
- Fixed save-triggered timeline refresh loss by passing `isFileSystemBusy` from `useProjectDocumentController()` into `useProjectFileWatcher()` and marking explicit saves busy while project files are written. The directory watcher now ignores the app's own save writes instead of reloading stale disk state over current timeline edits.
- Follow-up save fix: directory timeline load now preserves visible `.timeline.json` relative paths instead of forcing root/nested timeline files to `timelines/...`, and directory save writes timelines back to their existing safe relative paths. Explicit save also keeps the filesystem busy flag active briefly after writes so debounced watcher events from the app's own save cannot reload over current timeline edits.

## Verification
- Added project normalization tests for transition defaults and missing-category repair.
