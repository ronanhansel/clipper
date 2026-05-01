# Keyboard Mode Shortcuts

## Summary
- Added global `Ctrl/Cmd+1..4` shortcuts for switching between editor and timeline modes.
- `Ctrl/Cmd+1` selects Interactive, `Ctrl/Cmd+2` selects Code, `Ctrl/Cmd+3` selects timeline Edit, and `Ctrl/Cmd+4` selects timeline Composition.

## Notes
- Shortcuts are handled in the existing app-level `keydown` listener in `src/App.tsx`.
- The numbered shortcuts run before code-editor target filtering so mode switching remains available while Monaco is focused.
- Electron also captures `Ctrl/Cmd+1..4` in `before-input-event` from `electron/main.ts` and forwards them through `window.clipper.onModeShortcut`, because macOS/Electron can consume these shortcuts before renderer `keydown` handlers run.
