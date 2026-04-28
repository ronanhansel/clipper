# Hide Code Pane In Interactive

## Change

- The Monaco-backed `CodePane` is now mounted only while the center editor mode is `code`.
- Interactive mode renders only the frame preview instead of keeping an invisible absolute code editor layer alive.

## Architecture Note

- The mode boundary stays in `src/App.tsx`, where the center editor chooses between `FramePreview` and `CodePane`.
- `CodePane` already persists scroll and Monaco view state on unmount, so unmounting it when leaving Code mode avoids hidden Monaco paint artifacts without adding new state paths.
- Reuse this pattern for future heavyweight alternate panes: do not keep browser/editor surfaces mounted under interactive preview unless live background behavior is required.
