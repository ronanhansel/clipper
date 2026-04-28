## Composition File Watch

Added for v0.2.5 to keep code-backed compositions in sync with external edits from agents or local tools.

Architecture note: Electron owns filesystem watching because renderer code only has the safe `clipperHost` bridge. The renderer registers the active project manifest, all known composition `part.filePath` files, and the active project directory through `clipperHost.watchProjectFiles`. File change policy stays in `App.tsx`: if the changed composition is currently open in code mode, the source is marked stale and the user can refresh. Otherwise the source is re-read, parsed through `partFromSource`, applied to the project model, and saved snapshots are moved forward so interactive preview behaves like hot reload rather than an unsaved local edit.

Project-wide reload: directory or manifest changes are debounced and reload the active manifest from disk when there are no local unsaved changes. If local app changes exist, `App.tsx` marks the project refresh as pending and shows a header Refresh button so external additions such as new compositions referenced by `project.json` do not overwrite local edits without user action.

Reuse: future file-backed features should route through `clipperHost.watchProjectFiles` and keep conflict policy in the renderer, where editor mode, selected part context, and local unsaved state are available.
