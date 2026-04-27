# Frame Focus Point Overlay

- Added a visible crosshair overlay in the frame preview while zoom focus or pan target picking is active.
- The overlay reads the selected zoom marker `focus` directly, and converts pan marker `position` back into its frame target point with `cameraTranslationToFramePoint`.
- Frame picker drag updates now only run while the preview has captured the pointer, preventing the marker from changing on hover after the inspector picker button is clicked.
- Verification: `npm run typecheck` passes.
