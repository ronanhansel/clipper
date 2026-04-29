# File Manager Reentry Drop

Fixed File Manager reordering after dragging a row out of the tree and back in.

Architecture note: the drag fallback remains local to `src/components/FileManager.tsx` and still lets Arborist's native `onMove` path win whenever it fires. The fallback target is now derived from the live pointer row, row-half, folder-middle, and indent level instead of reusing `TreeApi.state.dnd.parentId/index`, which can stay stuck on Arborist's stale outer bottom drop after leaving and re-entering the tree. The computed target is validated through the existing `canDropFileTreeNode` project/asset rules before applying the `SimpleTree` move snapshot.

Bottom drop follow-up: Arborist can show a valid thin cursor in the empty bottom area even though its native drop callback may not fire there. The File Manager fallback now uses the live pointer-row target first, then falls back to Arborist's current DnD parent/index only while the pointer is still inside the tree bounds. This keeps re-entry row drops from using stale bottom state while making the highlighted bottom-most drop zone commit on release.

Verification: `npm run typecheck` passes.
