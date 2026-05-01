# File Manager Plus Menu

Updated the File Manager header plus button to open an app context menu instead of immediately creating a composition.

Architecture note: the change stays inside `src/components/FileManager.tsx` and reuses the existing `AppContextMenu`/`ContextMenuState` flow already used for File Manager right-click menus. The plus button now offers root-level project creation actions for a composition folder, timeline, and composition without adding a new menu primitive or global state.

Also completed the adjacent timeline file wiring needed by the File Manager tree: timelines are now included in the project file tree, new timelines receive a file path under the watched project directory, and timeline move operations update that file path when dropped into folders.
