## Composition Link Sync

Goal: keep File Manager composition file changes synchronized with timeline clips, detect unlinked compositions when files are deleted or moved outside the project, and auto-relink moved files when the same filename is found elsewhere inside the project folder.

Architecture note: the feature extends the existing renderer-side project file watch flow in `src/App.tsx`, where project manifests, composition sources, and normalized project state are already coordinated. Project-manager actions continue to mutate the canonical `ProjectManifest` so timeline clips update immediately through shared composition IDs. External filesystem moves are handled in the same watcher path to avoid a separate polling service.

Implemented:
- Added optional `sourceMissing` state to `CompositionClip` and normalized it through project loading.
- Deleted/moved-to-bin library compositions now leave timeline instances in place and mark them unlinked instead of removing them.
- Unlinked timeline/preview/rendered frames display as black; the timeline clip label changes to `Unlinked: ...`.
- Right-clicking a timeline composition exposes a relink file picker that preserves composition ID, markers, and timeline placement.
- Missing watched source files try to auto-relink by filename inside the active project folder before falling back to unlinked state.
- Folder renames now remap composition source paths along with project composition paths.

Verification: `npm run typecheck` and `npm test` passed on Apr 28, 2026.
