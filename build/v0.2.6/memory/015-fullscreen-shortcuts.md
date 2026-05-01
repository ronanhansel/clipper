# Fullscreen Shortcuts

## Summary
- Added global single-key fullscreen shortcuts in `src/App.tsx`.
- Press `F` to enter a frame presentation mode: Electron enters fullscreen and the renderer hides app chrome, sidebars, inspector, and timeline while centering the current frame.
- Press `T` to enter in-window theatre mode: the renderer hides app chrome, sidebars, inspector, and timeline while respecting the current window size instead of changing native fullscreen state.
- Press `Esc`, `F`, or `T` while either presentation mode is active to exit.
- Moving the pointer in either presentation mode reveals a floating playback overlay with jump-to-start, back one second, play/pause, forward one second, jump-to-end, and a scrubber.
- Presentation mode handles `Space`, arrow keys, `Home`, and `End` before focused form controls so the scrubber does not trap playback shortcuts after release.
- Text fields, editable text objects, selects, and Monaco targets are excluded so normal typing is not intercepted.

## Architecture Notes
- The shortcuts now use Electron IPC (`setWindowFullscreen`, `toggleWindowFullscreen`) because renderer-origin `requestFullscreen()` was not reliable for the desktop shell.
- `AppContent` owns the app root ref and presentation state because it already owns the global shortcut handler and the frame preview ref.
- `FramePreview` exposes stable `data-clipper-frame-preview` and `data-clipper-frame-content` hooks for global fullscreen styling without pushing fullscreen-specific state through the preview component.
- `src/styles.css` contains the fullscreen and frame-presentation scaling rules because this is global app layout behavior. The frame content is centered and scaled to fit `1920x1080` inside the current fullscreen viewport while leaving normal editor zoom unchanged.
- During dev, the renderer catches stale-main-process IPC failures and falls back to renderer fullscreen so shortcut presses do not produce unhandled promise errors.
- Frame presentation uses a JS-measured `--clipper-presentation-scale` CSS variable (`stageWidth / 1920`) so Chromium reliably zooms the frame to fit width in both native fullscreen and theatre mode while preserving the 16:9 aspect ratio.
- Presentation mode makes the app root and preview stage fixed/inset so centering is computed against the visible viewport, not the normal editor grid or scroll layout.
- The scaled element is the `1920x1080` preview viewport itself, not the inner frame content, to avoid distorted/cropped output from nested transforms.
- The floating presentation transport lives in `AppContent` beside the preview column so it can reuse existing playback commands (`jumpToStart`, `stepSceneTime`, `togglePlayback`, `jumpToEnd`, `scrubToSceneTime`) without duplicating timeline logic.
- The presentation scrubber has a live rAF-backed display time while playing, and it blurs on pointer release/cancel so keyboard control returns immediately.

## Reuse Guidance
- Add future global preview display modes next to `toggleFullscreenElement` and the existing App-level keyboard handler.
- Prefer data attributes for fullscreen-only styling hooks so preview render logic remains focused on frame content and pointer interactions.
