# Context Menu No-Drag

- App context menu panels now include the shared `appNoDragRegion` class.
- This keeps project-title context menu items, including `Rename project`, fully clickable when the menu appears over the draggable Electron app bar area.
- The fix is centralized in `ContextMenuPanel`, so asset context menus and nested submenus inherit the same no-drag behavior.
