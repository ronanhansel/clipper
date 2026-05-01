# Rendering Approach Validation

## Context

- User asked to test the recent render/playback edits carefully and research the best next performance approach for the current app pace.
- Current preview is still DOM/CSS/HTML based, with recent changes moving playback timing into refs, local preview rAF state, and CSS-variable playhead updates.

## Findings

- `npm test`, `npm run typecheck`, and `npm run build` pass after this validation pass.
- Added focused render runtime tests for motion/template transform merging, rich-text preservation for style-only templates, escaped template failure output, and stretched background evaluation.
- Electron export still reloads a complete `data:` HTML document per frame and then calls `capturePage`; this remains the highest-leverage performance target.
- External Electron docs confirm offscreen rendering can emit `paint` frames and supports GPU-accelerated and software-output modes. That maps better to Clipper's current DOM renderer than rewriting the editor preview in WebGL.
- MDN WebGL docs confirm WebGL is a canvas GPU API for high-performance 2D/3D graphics, but Clipper's current core requirements include editable DOM text, HTML/SVG/template rendering, and export fidelity, so a full WebGL migration would add complexity before the render model is ready.

## Recommendation

- Keep the live editor preview on DOM/CSS for now.
- Next performance step should be export architecture: load one persistent render document/window, update deterministic frame data/time per frame, then capture; consider Electron offscreen rendering after that baseline works.
- Continue extracting deterministic render evaluation into shared runtime code before adding WebGL. Use WebGL later for bounded features such as shaders, particles, heavy image compositing, or GPU-native effects.

## Verification

- `npm test` passes: 3 files, 12 tests.
- `npm run typecheck` passes.
- `npm run build` passes. Vite still reports existing large chunk warnings for app/editor dependencies.
