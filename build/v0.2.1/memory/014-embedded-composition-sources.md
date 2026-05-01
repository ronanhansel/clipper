# Embedded Composition Sources

- Goal: make composition TypeScript source first-class project data instead of canonical sidecar files.
- The project document should own both compiled composition state and editable code so undo/redo, delete/restore, save/load, and project management do not depend on the file manager.
- File-based composition sources should become import/export or legacy migration inputs only; normal editing should happen through Monaco against project state.
- Architecture note: keep code editing in `CodePane`, but route source changes through project document state and `compositionFromSource`; persistence should save one manifest with embedded sources and avoid composition file watchers for ordinary projects.
- New composition creation now uses compact `nanoid(8)` ids as the canonical composition identity. Names remain human-readable labels, while legacy `filePath` values are retained only as internal source/folder keys for older project structures.
- The left-side resource UI is now one unsegmented File Manager tree surface. Composition entries and imported asset entries share the same row styling; existing composition drag-to-timeline behavior and asset file import/drop behavior are preserved.
