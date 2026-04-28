# Persistent Export Renderer

## Context

- User approved replacing the per-frame export page reload with a persistent hidden render document.
- Goal was to improve video export performance without changing the editor's DOM/CSS/HTML/SVG render model or introducing WebGL prematurely.

## Implementation

- Updated `electron/main.ts` video export loop to load one hidden HTML shell into the renderer `BrowserWindow` before frame iteration.
- Added `buildFrameShell()` with a stable `#clipper-frame-root` and `window.__clipperSetFrame(html)` helper.
- Replaced per-frame `rendererWindow.loadURL(data:...)` calls with `renderFrameHtml(rendererWindow, frameHtml)`, which calls `executeJavaScript` into the persistent page.
- Split the old full-document frame builder into `buildFrameBody()`, keeping existing DOM/CSS output for backgrounds, objects, templates, SVG, HTML, camera zoom, and translation.
- `__clipperSetFrame` waits for two `requestAnimationFrame` ticks before `capturePage`, giving Chromium a paint opportunity after the DOM update.

## Why This Approach

- Avoids full navigation, document parse, script setup, and page lifecycle work for every exported frame.
- Preserves current export fidelity because the rendered frame markup is still the same DOM/CSS/HTML/SVG structure.
- Keeps the next optimization path open: update individual DOM nodes from deterministic render state instead of replacing root HTML each frame, or evaluate Electron offscreen rendering later.

## Verification

- `npm test` passes: 3 files, 12 tests.
- `npm run typecheck` passes.
- `npm run build` passes. Vite still reports existing large chunk warnings for app/editor dependencies.
