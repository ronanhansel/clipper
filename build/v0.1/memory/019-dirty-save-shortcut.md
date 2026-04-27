# 019 Dirty Save Shortcut

## Context

- User wanted the code-pane save button hidden unless there are changes.
- User wanted save highlighting when changes exist.
- User wanted keyboard saving with `Ctrl+S` on Windows/Linux and `Cmd+S` on macOS.

## Changes

- `CodePane` now tracks a `savedSource` baseline loaded from the part file.
- The code-pane Save button always renders; it is greyed out when the current Monaco source matches the saved baseline and accented when dirty.
- The top header Save button now tracks project-manifest dirty state separately from the code pane and writes the full project JSON to `clipper/projects/prj_v01_sample/project.json`.
- The code-pane Save button only tracks and writes the current part TypeScript source file, then refreshes the in-memory preview model.
- Saving code can make the project dirty because the refreshed preview model may differ from the last saved project JSON.
- Save buttons avoid glow effects and use only border/background contrast for emphasis.
- Saving validates the TypeScript part source, writes the part file, refreshes the in-memory project preview from that source, and then updates the saved baseline.
- Monaco registers `CtrlCmd+S`, and the pane also listens for browser-level `Ctrl+S`/`Cmd+S` to prevent default browser save behavior.
- App-level keyboard shortcuts now ignore events from focused Monaco editor instances, so typing space in code does not toggle playback while `Ctrl+S`/`Cmd+S` still saves.
- Reloading source is keyed to `part.filePath` instead of the whole `part` object so in-memory preview edits do not immediately discard code editor text.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.

## Later Timeline Polish

- Timeline footer now uses `select-none` and pointer handlers call `preventDefault()` for scrub and zoom drag starts to avoid native text selection highlight during timeline interactions.
- Zoom marker selection no longer selects the containing part. The parts row highlight now follows explicit part selection instead of zoom marker clicks.
- Timeline zoom and part blocks now clip their labels with single-line ellipsis instead of wrapping when the block is narrower than the text.
