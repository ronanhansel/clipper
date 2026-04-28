# Collapsible Assets Folders

Started v0.2 work to make folders in the Assets panel collapsible without changing the persisted project asset schema.

Implementation notes:
- Scope is `src/App.tsx` file manager/tree UI.
- Keep collapsed state local to the file manager so asset ordering and manifest data remain unchanged.
- Preserve existing row selection, context menus, rename, drag/drop, and file import behavior.
- Added folder disclosure chevrons using `ChevronDown`/`ChevronRight` from `lucide-react`.
- Creating a folder inside a collapsed folder, dropping files into a folder, or moving an asset into a folder expands that folder so the new child remains visible.
- Removed the `Drop into folder` text badge from folder hover/drop feedback while keeping the existing folder highlight.

Verification: `npm run typecheck` passed.
