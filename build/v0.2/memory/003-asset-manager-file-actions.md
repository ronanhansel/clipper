# Asset Manager File Actions

Started v0.2 work to fix asset manager file ordering overflow and improve asset file operations. Goals: inspect existing asset manager UI, keep current visual language, reuse project primitives/plugins where available, and add practical drag/drop plus copy/duplicate support without large rewrites.

Implemented in `src/App.tsx`:
- Left sidebar tabs now share the same segmented tab constants/styles as the inspector tabs.
- Removed verbose Asset Manager and Tools title cards; asset path is now a compact truncated line above the New Folder action.
- Asset tree rows use internal depth padding and `minmax(0, 1fr)` to avoid row overflow in the narrow left sidebar.
- Asset drop zone is content-sized with a bounded scroll area (`min-h-[220px]`, `max-h-[460px]`) instead of filling the full sidebar height, so its bottom edge remains visible.
- Row actions are absolutely positioned and only appear on hover/focus, so hidden actions no longer permanently consume filename width.
- Kept native browser drag/drop rather than adding a dependency; rows set `text/plain` drag data and support reordering.
- Added per-row hover/focus actions: copy asset path to clipboard, duplicate asset, and delete asset.
- Restored missing memo comparator helpers for frame/background preview components that were already referenced in `src/App.tsx`.
- Added explicit asset drop intents: top/bottom of a row shows a blue reorder line, while the middle of a folder highlights the folder and shows `Drop into folder`.
- Asset rows can now be reordered manually and moved into folders; external file drops on folder-middle import a reference into that folder.
- Removed the row drag handle column; rows remain draggable directly.
- Removed the top New Folder button and helper copy. New folders are created from the right-click menu on empty space or inside the clicked folder.
- Inline rename is no longer triggered by clicking/selecting text. Right-click an asset and choose Rename to enter edit mode.
- Asset state is persisted on `ProjectManifest.assets`, so manual ordering, imported references, delete-instance actions, and undo/redo are part of project history.
- Imports store source paths/references only and do not copy files into the asset folder. Delete removes the organizational asset instance only, not the disk file.
- Sorting is no longer always-on. Right-click a folder/root and choose a sort action to sort only that parent directory.
- `Sort by` is now a hover submenu in the reusable context menu. Context menu panels measure their bounds and flip/clamp submenus to stay inside the viewport, so the component can be reused on right-side panels too.

Verification: `npm run typecheck` passed.
