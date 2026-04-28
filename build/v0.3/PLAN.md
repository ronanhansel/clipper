# Clipper v0.3 Plan

## Focus

v0.3 is focused on testing the best architecture for the middle-screen renderer and interactions. The goal is to move toward a canvas-first interactive surface while preserving WYSIWYG fidelity for arbitrary HTML/CSS/effects authored in code mode.

## Renderer Direction

- Treat the project manifest, part model, frame objects, background layer, motion markers, zoom markers, and translation markers as the only canonical scene state.
- Prototype the middle screen as one canvas-driven editor surface for smooth interaction, selection, marquee, handles, focus picking, dragging, resizing, and camera previews.
- Preserve arbitrary HTML fidelity by using Chromium/DOM rendering as the source for raster captures rather than attempting to reimplement browser layout and CSS in canvas.
- Start with full-frame rasterization when switching from code to interactive mode because it is the simplest WYSIWYG path and best matches the user's editing expectation.
- Apply camera zoom/pan transforms in canvas where possible so zoom/translation marker playback can stay smooth without recapturing unchanged frame content.
- Keep the current DOM frame renderer available as a fallback until canvas parity and interaction behavior are proven.

## Interaction Direction

- Pointer-move interactions should remain non-continuous for canonical project writes.
- Use rAF-throttled transient canvas previews during drag, resize, marquee, and picker movement.
- Commit canonical object/frame state only on pointer up, pointer cancel, blur, or explicit finalization.
- Draw selection boxes, resize handles, marquee rectangles, hover state, and pick-point overlays directly on the canvas prototype when possible.
- Use a temporary DOM text-edit overlay only while editing text, then commit back into the scene model and redraw the canvas.

## Open Questions To Test

- Whether full-frame DOM raster capture is fast enough for code-to-interactive refresh and idle editing.
- Whether full-frame recapture per frame is viable for arbitrary animated HTML, or whether animated/dirty object-level rasterization is required.
- Which browser capture path gives the best tradeoff in Electron: hidden DOM host, iframe, SVG foreignObject, `capturePage`, or another Chromium-backed snapshot route.
- How much interaction logic should be shared between DOM fallback and canvas prototype before replacing the DOM middle-screen renderer.
- Whether export should be moved to the same renderer pipeline during v0.3 or after the interactive renderer stabilizes.

## Progress

- v0.3 version bump started.
- Renderer strategy documented: canvas-first middle screen with full-frame DOM rasterization as the first WYSIWYG prototype path.
- Initial memory added for future agents to continue the renderer experiment.
- Added the first `FrameCanvasPreview` prototype for the interactive middle screen.
- The canvas prototype keeps a DOM render source for full-frame rasterization, draws the rasterized frame into one canvas, and draws selection boxes, handles, marquee, and pick-point overlays on canvas.
- Text editing still falls back to the existing DOM `FramePreview` path so `contentEditable` behavior remains safe while the canvas interaction model is tested.
