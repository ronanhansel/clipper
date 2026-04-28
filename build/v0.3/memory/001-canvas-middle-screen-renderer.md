# 001 Canvas Middle Screen Renderer

## Context

The user bumped the project to v0.3. The main v0.3 focus is to test the best way to implement the renderer and interactions in the middle screen.

The desired direction is a canvas-first middle screen similar in feel to Figma/Rive, but Clipper must still support arbitrary HTML/CSS/effects authored in code mode with WYSIWYG fidelity in interactive mode.

## Decision

Do not attempt to manually reproduce arbitrary HTML/CSS in canvas. Use the browser/Chromium DOM renderer as the fidelity source, then rasterize rendered output into bitmaps that the middle-screen canvas can draw.

The first prototype should favor full-frame rasterization when switching from code to interactive mode because it is simpler and should best satisfy the expectation that code and interactive views match exactly. Object-level rasterization can be introduced later if full-frame invalidation is too slow.

## Target Architecture

- Canonical state remains the existing `ProjectManifest`, `Part`, `BackgroundLayer`, and `FrameObject` model.
- Current DOM frame renderer remains available as a fallback during v0.3.
- New canvas preview should draw the middle frame, selection overlays, handles, marquee, hover state, and pick point.
- Hidden DOM/Chromium render host should render the same part for raster capture.
- Full-frame bitmap cache should be invalidated on code/model changes and recaptured before or during interactive preview.
- Camera zoom/pan should ideally be applied by canvas transforms over the cached frame bitmap instead of being baked into every capture.
- Drag/resize/marquee/picker interactions should use rAF-throttled transient canvas state and commit canonical project state only on release/finalization.
- Text editing can temporarily use a DOM overlay above the canvas while editing, then commit back to the scene model.

## Risks

- Full-frame capture every animation frame may be slower than the current visible DOM renderer for arbitrary animated HTML.
- Arbitrary HTML with time-dependent effects may require per-frame recapture or later object-level dirty rasterization.
- Export currently has a separate hidden DOM document path in `electron/main.ts`; v0.3 should avoid letting export, DOM preview, and canvas preview diverge long term.
- Selection and resize hit testing must preserve current behavior and constraints while moving to canvas.

## Next Implementation Steps

- Add a feature-flagged `FrameCanvasPreview` beside the current `FramePreview`.
- Add a hidden render host or capture path for producing a full-frame bitmap from the current part.
- Draw the captured bitmap into canvas with the correct frame scale and camera transform.
- Port selection overlay, marquee, pick-point, and basic hit testing to canvas first.
- Keep DOM fallback available until visual parity and interaction fidelity are verified.

## Implementation Update

- Added `FrameCanvasPreview` in `src/App.tsx` and wired it into the interactive middle screen when no text object is actively being edited.
- The existing `FramePreview` remains the fallback and is still used during text editing to preserve `contentEditable` behavior.
- `FrameCanvasPreview` renders the current frame into an offscreen/covered DOM source, serializes that source into an SVG `foreignObject`, loads it into an image, and draws the full-frame raster into one canvas.
- The canvas path now handles basic object hit testing, marquee start/update, object drag start, resize handle hit testing, text double-click handoff, and forwards pointer lifecycle events into the existing commit logic.
- Selection boxes, resize handles, marquee rectangles, and pick-point overlays are drawn directly in canvas.
- The DOM render source remains mounted under the canvas so the existing imperative drag/resize preview code can mutate object elements before the canvas recaptures the frame.
- `FrameObjectView`, `BackgroundLayerView`, and `BackgroundElementView` now include key layout styles inline so serialized DOM retains more fidelity when rasterized outside the normal app stylesheet context.

## Verification

- `npm run typecheck` passes.
- `npm run build` passes. Vite still reports the existing large chunk warning.

## Follow-Up Notes

- This is intentionally a v0.3 prototype, not the final renderer architecture.
- SVG `foreignObject` rasterization is a renderer-process prototype path. It may need replacement with an Electron/Chromium capture path if arbitrary HTML fidelity or external asset handling is insufficient.
- Full-frame recapture is scheduled during pointer movement so drag/resize previews can reflect existing DOM mutations, but this should be benchmarked because it may be expensive for animated or complex HTML.
- Current canvas hit testing uses object bounds and does not yet account for arbitrary CSS transforms or irregular HTML hit regions.

## Flash Fix

- The initial canvas prototype left the DOM raster source visible behind the canvas at unscaled 1920 x 1080 size, causing a large-element flash when switching from code to interactive before the canvas had drawn the raster image.
- Fixed by adding the Tailwind `opacity-0` class to the live raster source wrapper. This hides the source in the React app while keeping the cloned serialized markup visible inside the SVG `foreignObject` capture because the capture does not include Tailwind CSS.
- `npm run typecheck` passes after the fix.

## Lag Investigation

- The first canvas prototype was laggier than the original DOM path because it stacked multiple expensive renderers in the same hot path: hidden React/DOM frame rendering, DOM clone serialization, SVG `foreignObject` construction, image/bitmap decode, GPU upload, and canvas draw.
- The biggest mistake was scheduling full-frame rasterization from pointer movement. That made drag/resize/marquee work much heavier than DOM-only interaction.
- Removed pointer-move and pointer-down rasterization. Pointer movement now updates only canvas interaction overlays/previews and forwards to existing commit logic; full-frame raster capture is scheduled from model/time changes and after pointer-up commits.
- The second cost was leaving the hidden DOM raster source mounted invisibly after capture, which meant the app still paid much of the original DOM renderer cost plus canvas work. The source is now mounted only while a capture is needed and unmounted after the bitmap is cached.
- `npm run typecheck`, `npm test`, and `npm run build` pass after the lag fix. Vite still reports the existing large chunk warning.

## Renderer Direction After Investigation

- Canvas has potential for smoother interaction only if the cached bitmap is treated as a layer and interaction avoids recapturing DOM while the pointer moves.
- Full-frame SVG `foreignObject` rasterization is not a good high-frequency render path. It is acceptable for code-to-interactive refresh experiments, but arbitrary animated HTML likely needs an Electron/Chromium capture path, object/layer rasterization, or explicit DOM fallback during animation-heavy playback.
- Next benchmark should measure initial raster time, pointer-move draw time, and playback frame capture time separately so renderer choices are based on measured bottlenecks.

## Visible Frame Must Stay Canvas-Only

- User identified that the frame viewport DOM node was still moving/painting because the raster source lived inside the visible middle-screen frame container.
- Moved the raster source out of the frame viewport using a React portal into an offscreen fixed host on `document.body` with strict containment.
- The visible middle-screen frame container now contains only the canvas; the DOM raster source is no longer a child of the frame viewport selector path.
- The offscreen raster host mounts only while capture is needed and unmounts after the cached bitmap is ready.
- This aligns the v0.3 prototype with the intended architecture: all visible frame animation and overlays should happen in one canvas repaint, while DOM is only a temporary offscreen fidelity source for raster capture.

## Canvas-Native Ground Truth Update

- User refined the target architecture: switching from Code to Interactive should convert the project into a canvas-native scene. Interactive should edit only objects that safely round-trip to the shared project/code model.
- Implemented `CanvasScene` conversion in `src/App.tsx`.
- Supported canvas-native objects are currently `rect` and `text` objects without unsupported paint/filter fields such as gradients, `backgroundImage`, `filter`, or `backdropFilter`.
- Supported objects are drawn directly in canvas with basic fills, borders, rounded rects, shadows, opacity, transforms, text styling, line breaks, line height, alignment, and letter spacing.
- Unsupported objects (`html`, `svg`, images for now, and complex styled objects) are treated as locked visual content. They are rasterized through the offscreen DOM host and drawn into the canvas, but they do not participate in hit testing, marquee selection, drag, resize, or text editing.
- Marquee selection now filters through `isCanvasNativeObject`, preventing unsupported locked objects from becoming selected.
- Canvas hit testing now uses only selectable scene nodes, so locked raster content remains visible context but cannot be edited in Interactive.
- `npm run typecheck` and `npm test` pass after this update.

## Artifact Fixes

- Fixed moving canvas-native rectangles being clipped before their animation transform was applied. This caused the animated dot template hero dot to appear as a half/quarter circle while moving over the locked raster dot field.
- The fix removes the pre-transform clip in `drawCanvasObjectNode`; native rects now draw in their transformed position instead of being cropped by stale bounds.
- Added lightweight native rect drafting lines to the Grid Reveal sample background because the sample snapshot described visible drafting lines but the manifest background had no elements, making the template read as black at early/current preview times.
- Also updated `clipper/projects/prj_v01_sample/scn_opening/prt_grid_reveal.ts`; startup loads composition source files and overwrites manifest-only sample edits, so both the bundled manifest and source composition need the drafting background elements.
- `npm run typecheck` and `npm test` pass after these fixes.
