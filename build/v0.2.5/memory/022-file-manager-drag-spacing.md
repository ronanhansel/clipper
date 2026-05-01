# File Manager Drag Spacing

Fixed file manager row spacing and asset drag/drop hit-testing in `src/components/FileManager.tsx`, then reimplemented the project file `react-arborist` wrapper without Zustand or React context.

Architecture note: project composition/timeline rows now use Arborist's native controlled-tree behavior. `CompositionManager` builds the tree and passes callbacks directly into `Tree` via `onMove`, `onRename`, and `onActivate`; row rendering calls Arborist node APIs such as `node.edit()`, `node.submit()`, `node.reset()`, `node.toggle()`, and `node.handleClick()`. There is no FileManager-specific Zustand store, React context, or parallel rename state. Row height and indent use larger Arborist-style values so the built-in drop zones match the rendered rows.

Folder moves are now wired through `onMoveCompositionFolder` in `FileManager` and `moveCompositionFolder` in `App.tsx`, which rewrites composition source paths, folder paths, library paths, and scene composition paths when a folder is moved by Arborist.

Follow-up: removed the forced `sortCompositionNodes` pass from project tree construction because it fought Arborist's native `onMove` ordering. The composition tree height now syncs from `TreeApi.visibleNodes.length` after Arborist toggles so collapsed folders do not leave blank vertical space before the imported asset list.

Unified tree update: File Manager now renders one Arborist tree for project folders, compositions, timelines, asset folders, and asset files. The previous separate composition and imported-asset trees were removed so all rows share the same spacing, preview, selection, and DnD model. The custom drag preview now uses Arborist's `mouse` coordinates with `position: fixed` so it follows the cursor instead of rendering at the bottom of the manager.

Interaction polish: added Arborist bottom padding to create a reliable drop zone after the last row. Composition rows are no longer dimmed or disabled when already present on the timeline; the file manager treats every row equally as a file/folder entry.

Density update: reduced unified file-manager row height to 30px with smaller icons/text and added double-click folder toggle behavior in the Arborist row renderer.

Folder move-order fix: project folder row IDs are path-based, so moving a folder changes its row ID. The local Arborist order map now stores the moved folder's destination ID and calls folder reorder with the destination path, allowing move-in/move-out drops to land at the intended index on the first drop.

Edge-drop fix: the unified Arborist tree now has top and bottom drop padding plus a minimum drop surface height, so releasing near the top/bottom of the File Manager remains inside Arborist's drop target. The custom fixed drag preview also hides defensively on `dragend`, `drop`, and `pointerup` to avoid stale ghost previews if the HTML5 backend misses a final update at an edge.

Invalid cursor fix: Arborist's outer-drop path treats empty list space as a drop after the last visible node, which made the cursor snap to the bottom when dragging above the top rows or into unsupported bottom targets. The File Manager now gates the custom cursor by the pointer's real tree bounds and adds `disableDrop` validation for mixed project/asset targets, hiding the cursor immediately when the current target cannot accept the dragged node.

Boundary/cursor refinement: cursor visibility now uses the custom drag preview's live mouse coordinates instead of window `dragover`, avoiding stale cursor state when Arborist keeps reporting the previous empty-space drop. A temporary dashed top/bottom boundary indicator was added and then removed at user request. Top drop padding is now zero, and the custom cursor is hidden if Arborist's line position is more than one row away from the live pointer, preventing stale bottom-line rendering while hovering near the top edge.

Move mirror rewrite: File Manager drag moves now use Arborist's `SimpleTree` move helper to create the final tree state first. The app then mirrors that final tree snapshot into project state in one update: asset tree, composition folder paths, composition file paths/source keys, composition order, timeline paths/order, and scene timeline order. This replaces the fragile manual per-type move/reorder translation that broke folders containing files when moved into another folder.

Order rebuild fix: after mirroring a drop to project state, the rebuilt project tree can naturally group folders before files because it is reconstructed from `compositionFolders` plus files/timelines. File Manager now preserves the actual Arborist final tree as an order reference for the next rebuild, so moving a node into/out of a folder keeps the exact requested drop index instead of snapping to the top/end after normalization.

Bottom cursor fix: `react-arborist`'s outer-drop hook renders a cursor in empty bottom list space but does not execute a drop handler there. File Manager now only shows the custom drop cursor while the pointer is over actual row space, preserving valid last-row bottom-half drops while hiding the non-functional empty bottom-space marker.

Bottom drop precision follow-up: removed the fake empty bottom padding entirely and tightened custom cursor visibility to Arborist's real row drop threshold. This prevents a visible bottom marker in areas where Arborist cannot fire `onMove`; the marker now only appears where dropping can actually move the node.

Bottom fallback drop: some bottom/end cursor positions are still produced by Arborist's outer hover path without a matching native `drop()` callback. File Manager now records the visible root-end fallback target and, on window `drop`, applies the same Arborist `SimpleTree` final-state move if no native Arborist `onMove` completed. This keeps native row drops authoritative while making the visible bottom/end marker actually move the item.

Nested fallback correction: the bottom/end fallback was too narrow because the visible line can represent any Arborist destination parent/index, including a nested folder's end position. File Manager now keeps a `TreeApi` ref and records `tree.state.dnd.parentId/index` as the fallback target during drag preview updates, then applies that exact destination if native `onMove` does not fire.

Persisted File Manager state: File Manager state moved into `editorState.fileManagerState`, not the project root, so it is treated like implicit editor UI state and is auto-saved by the existing editor-state persistence path without lighting the main Save button. The state contains a lightweight Arborist-derived node tree (`id` plus child order) and `openState`; File Manager hydrates raw project/assets data through this saved state without making the saved tree the source of actual file data. Drag/drop snapshots write the refreshed `editorState.fileManagerState`, and Arborist `onToggle` persists folder open/closed state. When saved open state exists, `openByDefault` is disabled so refreshes do not force every folder open.

Implicit file operations: mutating File Manager callbacks are wrapped in an implicit autosave path. After a File Manager mutation updates project state, App immediately advances saved snapshots and debounces a background `projectPersistenceService.saveProject` write, so file operations such as move/reorder/create/delete/rename/sort/import no longer light the main Save button. Non-mutating actions such as copy/reveal/select are not wrapped.

Provider refactor: File Manager now has an internal `FileManagerProvider`/`useFileManager` context boundary. The external `FileManager` API remains stable, but `UnifiedFileManagerTree` and `UnifiedTreeNode` read data/actions from context instead of receiving a large threaded prop bag. App also builds a typed `fileManagerProps` boundary object and renders `<FileManager {...fileManagerProps} />`, keeping the JSX tree from carrying the full dependency list inline.

Delete shortcut: File Manager tracks Arborist selection and handles `Cmd+Backspace`/`Ctrl+Backspace` at the File Manager section level. The shortcut ignores text-editing targets and routes the selected asset, project folder, composition, or timeline through the existing delete callbacks.

Default folder cleanup: removed the built-in `media` and `audio` asset folders from `defaultAssets` and `fallbackProject`. `normalizeProject` now drops empty legacy preset folders with IDs `ast_folder_media` and `ast_folder_audio`; folders with user content are preserved to avoid deleting files.

Cleanup: removed the unused `activeTimelineId` prop from `FileManager` and its call site in `App.tsx`.

Important behavior: external file drops still import into the hovered folder for inside drops, and into the current parent folder for before/after drops. Asset reordering now works consistently inside nested folders because before/after intents target the actual hovered asset.
