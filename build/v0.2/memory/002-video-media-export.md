# Video Media Export

Media export is being changed from single-frame PNG rendering to full-scene MP4 rendering. The existing deterministic frame renderer in `src/App.tsx` should remain the source of truth for visual output: render each timeline frame from project data, apply part-local motion plus zoom/translation markers, then stream raw 1920x1080 RGBA frames to Electron.

Electron owns MP4 encoding through a bundled ffmpeg binary so export works out of the box. The renderer should not screen-record the editor UI and should not rely on browser `MediaRecorder` because Chromium MP4 support is not reliable.

Implementation notes:
- Keep project JSON export behavior unchanged.
- Media export should produce `.mp4` only.
- Start with 30 fps and H.264/yuv420p for broad compatibility.
- Use save-dialog cancellation as a normal no-op, not an error.

Completed changes:
- Added `ffmpeg-static` as the bundled encoder dependency.
- Added Electron IPC for video export sessions: start, write raw RGBA frame, finish, and cancel.
- Changed the export dialog media tab from PNG frame export to MP4 video rendering.
- Refactored the renderer path so frame SVG output is drawn to canvas, then the full scene is rendered at 30 fps and streamed to ffmpeg.
- Verified with `npm run typecheck` and `npm run build`.

Follow-up changes:
- Removed the Vite/browser video export bridge because Clipper is desktop-only and the bridge could crash the dev server if ffmpeg exited early.
- Changed the Electron preload from `preload.ts` to `preload.cts` so TypeScript emits `dist-electron/preload.cjs`; Electron now loads that CommonJS preload explicitly from `main.ts`.
- Updated `tsconfig.node.json` to include `electron/**/*.cts` so the CommonJS preload is emitted during dev and build.
- Video export now requires the Electron preload API and uses the native save dialog only.

Canvas taint fix:
- Renderer-side `getImageData()` failed because the frame canvas can become tainted after drawing SVG/HTML content.
- Video rendering now runs in Electron main through a hidden `BrowserWindow` and `webContents.capturePage()`, then pipes PNG frames into bundled ffmpeg.
- Added `npm run render:sample`, which renders `clipper/projects/prj_v01_sample/project.json` scene `scn_opening` to `clipper/exports/command-render.mp4` from the command line.
- Verified command rendering end-to-end; the produced MP4 was non-empty at 1,605,686 bytes.

Progress overlay:
- Electron main sends `clipper:video-export-progress` events during hidden-window rendering.
- The renderer shows a full-window blocking export overlay with percent, progress bar, status text, and `Stop export` action while video render is active.
- `Stop export` calls `clipper:cancel-render-video-export`, which marks the active export id as cancelled; the render loop stops, kills ffmpeg, and removes the partial output.
- Re-verified command rendering end-to-end after the overlay work; the produced MP4 was non-empty at 1,577,202 bytes.

Hardware encoding:
- Electron main now probes the bundled ffmpeg encoders once with `ffmpeg -encoders`.
- On macOS, it prefers `h264_videotoolbox` with `-b:v 12M -allow_sw 1 -pix_fmt yuv420p` when available.
- If VideoToolbox is unavailable, export falls back to `libx264 -preset veryfast -crf 18 -pix_fmt yuv420p`.
- Export progress status includes the selected encoder label.
