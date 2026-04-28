# File Manager Marquee Selection

Added File Manager multi-selection support in `src/components/FileManager.tsx`.

Architecture note: the feature stays inside the existing File Manager provider/context boundary. The provider now tracks the selected row IDs so panel-level shortcuts can operate on the same selection Arborist owns. `UnifiedFileManagerTree` enables Arborist multi-selection and adds a local, rAF-free marquee overlay scoped to the tree wrapper; it uses `TreeApi.visibleNodes` plus the shared row height to update Arborist selection while dragging over empty tree space. The tree still commits project/file changes through the existing `createFileManagerTreeSnapshot` flow.

Multi-file operations now reuse existing single-item File Manager callbacks. `Cmd+Backspace`/`Ctrl+Backspace` deletes the top-level selected rows, avoiding duplicate deletes when a selected folder contains selected children. Right-clicking a multi-selected row exposes selected-set actions for add-to-timeline, duplicate supported assets/compositions, and delete. Multi-row drag/drop uses Arborist `dragIds` and the existing snapshot mirroring path.

Focus follow-up: outside pointer clicks now clear Arborist's internal tree focus/selection in addition to blurring the active DOM element, so File Manager rows no longer remain visibly focused after clicking elsewhere.

Style follow-up: File Manager rows and the marquee selection rectangle now use square corners instead of rounded borders.

Empty-space focus follow-up: clicking blank space inside the File Manager now clears Arborist selection/focus as well. The marquee pointer-down path clears first, then rebuilds selection only if the pointer moves far enough to become a marquee drag.
