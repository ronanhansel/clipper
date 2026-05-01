# File Manager Marquee Selection

Added File Manager multi-selection support in `src/components/FileManager.tsx`.

Architecture note: the feature stays inside the existing File Manager provider/context boundary. The provider now tracks the selected row IDs so panel-level shortcuts can operate on the same selection Arborist owns. `UnifiedFileManagerTree` enables Arborist multi-selection and adds a local, rAF-free marquee overlay scoped to the tree wrapper; it uses `TreeApi.visibleNodes` plus the shared row height to update Arborist selection while dragging over empty tree space. The tree still commits project/file changes through the existing `createFileManagerTreeSnapshot` flow.

Multi-file operations now reuse existing single-item File Manager callbacks. `Cmd+Backspace`/`Ctrl+Backspace` deletes the top-level selected rows, avoiding duplicate deletes when a selected folder contains selected children. Right-clicking a multi-selected row exposes selected-set actions for add-to-timeline, duplicate supported assets/compositions, and delete. Multi-row drag/drop uses Arborist `dragIds` and the existing snapshot mirroring path.

Focus follow-up: outside pointer clicks now clear Arborist's internal tree focus/selection in addition to blurring the active DOM element, so File Manager rows no longer remain visibly focused after clicking elsewhere.

Style follow-up: File Manager rows and the marquee selection rectangle now use square corners instead of rounded borders.

Empty-space focus follow-up: clicking blank space inside the File Manager now clears Arborist selection/focus as well. The marquee pointer-down path clears first, then rebuilds selection only if the pointer moves far enough to become a marquee drag.

Cursor follow-up: File Manager rows now use a pointer cursor while preserving the existing double-click folder expand/collapse handler.

Double-click fix: File Manager now supplies a custom Arborist row renderer so click and double-click handling live on the same row wrapper. This avoids duplicate/default click handling and keeps folder double-click expand/collapse reliable while item contents still render through `UnifiedTreeNode`.

Double-click drag-handle follow-up: folder expand/collapse now runs from the second mouse-down captured by the rendered item itself. This fires before Arborist's drag handle can swallow the later double-click event, while ignoring the explicit chevron button so it does not double-toggle.

Collapse follow-up: the second mouse-down handler now reads Arborist's live `tree.isOpen(node.id)` state and explicitly calls `tree.close` or `tree.open`, so double-clicking an already-open folder collapses it again.

Blank-space focus follow-up: blank File Manager clicks now defer the clear until after the current click/focus cycle. Arborist can focus its tree container during the same pointer sequence, so the deferred clear prevents empty-space clicks from leaving the prior row focused. Marquee drags keep their final selection and only non-drag blank clicks clear.

Isolation follow-up: the outside-click handler no longer calls `document.activeElement.blur()`. It only clears File Manager Arborist selection/focus state, so switching to or interacting with the Effects tab is not affected by a global DOM blur.
