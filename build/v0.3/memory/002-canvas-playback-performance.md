Canvas playback performance diagnosis.

Goal: diagnose sluggish playback after refactoring Frame into Canvas and make playback smooth by reducing unnecessary React and canvas work during timeline playback.

Notes:
- Work started from `src/App.tsx`, where `FrameCanvasPreview` owns canvas drawing and the top-level playback loop advances `playhead` with React state.
- Diagnosed primary canvas hotspot: `FrameCanvasPreview` rasterized the hidden DOM source whenever `cameraTransform` changed, so zoom/pan playback cloned DOM, serialized XML, created a blob, and decoded an image every frame before drawing.
- Changed the canvas preview to cache an untransformed frame raster and apply `cameraTransform` directly with canvas `translate`/`scale`/`drawImage`.
- The hidden raster camera now uses an internal ref so the parent `cameraRef` transform effect cannot mutate the cached canvas source.
- Rasterization now skips `previewTime` changes unless the part/background has time-sensitive raster content; camera-only playback should redraw from the cached image without re-rasterizing.
- Follow-up for remaining roughly one-second stutter: time-sensitive parts were still creating and decoding SVG blob images every React playback tick. Added a 30fps minimum raster interval and use `createImageBitmap(blob)` when available, falling back to `HTMLImageElement`, to reduce main-thread decode/GC pressure while still drawing the cached canvas every frame.
- Verification passes with `npm run typecheck` and `npm test`.
