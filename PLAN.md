# Native 3D Layer Architecture — Plans A + B

## Goal

Make the preview a **real 3D scene**. Every visible FrameObject becomes its
own `THREE.Mesh` (or mesh hierarchy) with its own pixels at its own scene-
space `z`. The shared 2D-flattened composite goes away. DoF, lens, and any
future post-process operate on real 3D colour + depth instead of a baked
flat layer that ghosts content through other layers.

After this, future 3D primitives (extruded geometry, GLTF imports, in-scene
3D objects) are just additional `LayerNode` kinds in the existing registry.

## Current state (relevant facts)

- `LayerNodeSync` reconciles one `LayerNode` per visible FrameObject.
- `rectNode` and `nullNode` are already real 3D meshes — keep as-is.
- Every other type (`text`, `image`, `svg`, `html`, `template`,
  `custom-renderer`, `pattern2d`, `code`) uses `CaptureFallbackNode`:
  - **All** layers UV-crop into the _same_ shared composite texture
    captured once via `drawElementImage(sourceRoot)`.
  - The composite is a 2D-flattened render of the entire DOM tree, so
    any overlapping 2D bounds bleed across layers in 3D.
- `CompositionBackgroundPlane` and `LayerCardSync` are dead code.

## Plan A — Per-element DOM capture

**One subagent.** No native shaders, no per-type renderers — just route the
existing capture pipeline per-layer instead of once for the whole scene.

### Changes

1. **`CapturePlaneTexture` →`SharedCaptureCanvas`** (rename + simplify):
   - Owns the single `<canvas>` that `drawElementImage` accepts as the
     capture root. Browsers require the source element to be a descendant
     of _this_ canvas, so it remains shared.
   - No texture, no `capture()` per-frame. Just `prepare(sourceRoot)`,
     `getCanvas()`, and an internal probe for `drawElementImage`
     availability.

2. **New `PerElementCaptureNode` replacing `CaptureFallbackNode`**:
   - Owns a **private offscreen `<canvas>`** + private
     `THREE.CanvasTexture` sized to the layer's bounds.
   - On each `update`:
     - Locate the layer's DOM subtree via
       `sourceRoot().querySelector('[data-object-id="…"]')`.
     - Call `context.drawElementImage(layerEl, 0, 0, w, h)` on the
       shared capture canvas's 2D context.
     - `drawImage` the result from the shared canvas into the node's
       private canvas.
     - `texture.needsUpdate = true`.
   - Mesh: `THREE.PlaneGeometry(w, h)` at `(positionX, positionY,
positionZ)` per `resolveLayerTransform`. UVs are full `[0,1]` (no
     crop).
   - Shader matches the existing alpha-tested premultiplied output for
     DoF gather.

3. **`CompositionRenderer`**:
   - Drop the single per-frame `captureTexture.capture(sourceRoot)`. The
     shared canvas still gets _prepared_ once with the source root for
     `layoutSubtree` / `paint` setup, but no full-frame capture happens.
   - Update `LayerNodeContext`: drop `compositeTexture`. Add
     `sharedCaptureContext: CanvasRenderingContext2D` so nodes can call
     `drawElementImage` directly.

4. **`CompositionWebGLHost`**:
   - Source DOM still mounts inside the shared capture canvas (browser
     requirement). Keep the portal logic.
   - Verify each FrameObject's DOM rendering exposes `data-object-id` so
     per-element capture can find it. Existing inspector-driven backends
     already emit this; verify in test fixtures.

5. **Delete**: `CompositionBackgroundPlane.ts`, `LayerCardSync.ts`,
   `CapturePlaneTexture.ts` (replaced by `SharedCaptureCanvas`),
   `CaptureFallbackNode.ts` (replaced by `PerElementCaptureNode`).

### Tests

- New: `PerElementCaptureNode` lifecycle (resize, dispose, capture-once
  per update).
- Update: `LayerCardSync.test.ts` fixtures move to `LayerNodeSync.test.ts`
  if not already covered.
- Visual: existing CompositionRenderer tests must still pass.

### Risk

- Per-frame N captures vs 1. Each call is hardware-accelerated by
  Chromium's experimental `drawElementImage`; cost should be ~linear in
  total layer pixel count (same as before, just split). Watch perf in
  `measurePreviewPerf` — flag if regression > 20%.
- DOM lookup by `data-object-id` ties `PerElementCaptureNode` to the
  inspector backend's emit contract. Document the contract in the node's
  docblock.

## Plan B — Native nodes for image, text, svg

After Plan A lands, the preview is correct. Plan B is quality + future-
proofing: replace the per-element DOM capture with real Three primitives
for the three types where it's worth doing.

Each B step is one subagent. They are independent — once Plan A is in,
they run in parallel.

### B1 — `ImageNode`

- `THREE.TextureLoader` (or async `Image` → `THREE.Texture`) keyed on
  `state.style.src`.
- Mesh: `PlaneGeometry(w, h)` + transform from `resolveLayerTransform`.
- Shader: textured plane with alpha-tested premultiplied output.
- Object-fit: `cover` / `contain` mapped to UV bounds in the shader.
- Cache + reuse textures across nodes that share `src`.

### B2 — `TextNode` (troika-three-text)

- `troika-three-text` produces SDF text meshes that stay sharp at any
  zoom and are real 3D objects. Already used in production WebGL apps.
- Add `troika-three-text` dependency.
- Read style: `fontFamily`, `fontSize`, `fontWeight`, `color`,
  `textAlign`, `lineHeight`, `letterSpacing`. Map to troika props.
- Mesh layout owns its own internal positioning; outer `LayerNode`
  wraps it in a Group at `resolveLayerTransform` position.
- Layout box matches the FrameObject's `bounds.width` (clip / wrap).
- Existing text fixtures must still render visually similar — diff
  margin: anti-aliasing differences are acceptable; layout positions
  must match within ±1 px.

### B3 — `SvgNode`

- `THREE.SVGLoader` (in `three/examples/jsm/loaders/SVGLoader.js`).
- Per `<path>`: `ShapePath.toShapes()` → `ShapeGeometry` → `MeshBasicMaterial`
  with the path's fill colour. Strokes: `SVGLoader.pointsToStroke`.
- Group all path meshes under one wrapper Object3D for the layer.
- Source: prefer `style.src` URL when present; otherwise inline svg
  markup from the FrameObject's evaluated state.
- Bounds: scale the parsed SVG to fit `(width, height)`.

### Tests per B-step

- Construction with minimal props.
- Update + dispose lifecycle.
- Style → uniform/material mapping for the type.
- Snapshot: render to an offscreen RT and compare to a baseline image
  for at least one fixture (pixel-diff tolerance because of AA).

### Out of scope for Plan B

- `html`, `template`, `code`, `pattern2d`, `custom-renderer` stay on
  `PerElementCaptureNode` — they need React/DOM rendering and have no
  natural Three primitive.
- `code` runtime hot-swap stays untouched.

## Phasing + subagent boundaries

```
Phase 0 (this turn) — main thread
  • Write PLAN.md (this file)
  • TaskCreate: A, B1, B2, B3, integration

Phase A — Subagent #1 (Plan A)
  Touches:
    src/components/preview/three/CompositionRenderer.ts
    src/components/preview/three/CompositionWebGLHost.tsx
    src/components/preview/three/layers/LayerNodeSync.ts
    src/components/preview/three/layers/layerNodeRegistry.ts
    src/components/preview/three/layers/nodes/captureFallbackNode.ts
    (delete) src/components/preview/three/CompositionBackgroundPlane.ts
    (delete) src/components/preview/three/LayerCardSync.ts
    (delete) src/components/preview/three/CapturePlaneTexture.ts
    (rename + rewrite) → SharedCaptureCanvas.ts + PerElementCaptureNode.ts
  Verifies:
    npm run typecheck
    vitest run components/preview/three
  Produces:
    agent-log/0.2.20/memory/003-plan-a-per-element-capture.md

Phase B (parallel after A) — Subagents #2, #3, #4
  B1 ImageNode — touches only
    src/components/preview/three/layers/nodes/imageNode.ts (new)
    src/components/preview/three/layers/LayerNodeSync.ts (one-line register)
    + tests
  B2 TextNode — touches only
    src/components/preview/three/layers/nodes/textNode.ts (new)
    package.json (add troika-three-text)
    src/components/preview/three/layers/LayerNodeSync.ts (one-line register)
    + tests
  B3 SvgNode — touches only
    src/components/preview/three/layers/nodes/svgNode.ts (new)
    src/components/preview/three/layers/LayerNodeSync.ts (one-line register)
    + tests
  Each verifies typecheck + own tests. Each produces a memo:
    004-plan-b1-image-node.md
    005-plan-b2-text-node.md
    006-plan-b3-svg-node.md

Phase C — main thread
  • Reconcile Phase B subagent edits to LayerNodeSync (merge conflicts on
    the registration file are resolved here).
  • Final visual check.
  • Memo: 007-plan-ab-integration.md
```

## Constraints carried into every subagent

- Project rules (CLAUDE.md): no backwards-compat shims, no comments
  explaining what code does, single source of truth, no silent failures.
- Don't touch files outside the listed paths.
- Don't reset/stash. Don't `git diff` unless asked.
- Run `npm run typecheck` before marking complete.
- Write the memo before closing.
