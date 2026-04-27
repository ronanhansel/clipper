# Global Save Shortcut

- `Ctrl+S` and `Cmd+S` now route through the app-level master save path before focus filtering, so the shortcut works globally instead of only in the code pane.
- The global shortcut saves active code first through the registered code-pane save hook, then persists the project manifest via the existing master Save flow.
- Monaco's internal `CtrlCmd+S` command now calls the same master save path, avoiding editor-focus behavior that only saved the source file.
- The previous code-pane window-level save listener was removed to avoid duplicate shortcut handling.
