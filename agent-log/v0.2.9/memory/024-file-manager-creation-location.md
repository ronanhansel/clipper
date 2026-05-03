# File Manager Creation Location Fix

## Summary

- Fixed the creation location for new compositions, timelines, and folders in both `FileManager` and `OsFileManager`.
- New items are now created relative to the right-clicked folder or the currently active directory, rather than being forced into hardcoded `compositions/` or `timelines/` subdirectories.
- Updated the context menu logic in `FileManager.tsx` and `OsFileManager.tsx` to pass the target `folderPath` to creation functions.
- Refined `useFileManagerProjectActions.ts` to respect the provided `folderPath` when generating new file paths, ensuring they are created in the intended location.

## Architecture Notes

- Modified `createComposition`, `createCompositionFolder`, and `createTimeline` in `useFileManagerProjectActions.ts` to treat the `folderPath` as the primary destination.
- In `OsFileManager`, the "effective directory" (the project root or the watched directory) is no longer automatically suffixed with `compositions/` or `timelines/` when creating new files, allowing for a flatter or custom project structure as desired by the user.
- The `UnifiedFileManagerTree` now correctly provides the nested path context to the `onCreateComposition`, `onCreateTimeline`, and `onCreateFolder` callbacks via the context menu.

## Files

- `src/components/FileManager.tsx`
- `src/components/OsFileManager.tsx`
- `src/app/features/file-manager/useFileManagerProjectActions.ts`
