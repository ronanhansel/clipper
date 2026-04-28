# Adjustment Layer Frame Skip

## Status

- Implemented for v0.2.5.

## Goal

- Add adjustment layers as scene-level timeline items.
- Add a frame-skipping adjustment that affects all rendered content below the adjustment layer during its active range.

## Architecture Note

- Adjustment layer data belongs on `Scene` because it spans linear parts and should not be serialized into any single composition source file.
- Frame-skip time mapping should live in `src/core/adjustments.ts` so editor preview and Electron export can share the same deterministic behavior.
- Timeline UI should treat adjustment layers as a separate composition-mode lane rather than normal parts, preserving existing part ordering and duration semantics.

## Implementation

- Added `Scene.adjustmentLayers?: AdjustmentLayer[]` with an initial `frameSkip` effect shape: `{ kind: "frameSkip", every: number }`.
- Added `src/core/adjustments.ts` to quantize scene time inside active adjustment ranges. The quantized scene time is used by derived preview state, live playback preview ticks, fast timeline selection, scrub snap boundaries, and Electron video export.
- Added a Direct-mode `Adjust` timeline lane. The Effects panel creates a `Frame Skip` layer at the playhead, and the inspector edits its name, start, duration, and frame step.
- Split the Effects panel into separate `Adjust` and `Motion` sections so adjustment layers are not mixed with zoom/pan marker tools.
- Adjustment layer blocks in the `Adjust` timeline lane now select on pointer down and can be dragged horizontally. Drag previews are DOM-transform based and commit the canonical `start` value on pointer release.
- Adjustment layer blocks also have left/right resize handles. Resize previews use width CSS variables and commit `start`/`duration` on pointer release.
- Adjustment lane items were aligned with pan/zoom node behavior: node-like DOM, direct selection, competing part/marker selection clearing, and resize previews applied to the full adjustment node instead of the handle.
- Fixed adjustment Inspector selection by keeping `clearMarkerSelection` scoped to pan/zoom marker state. Adjustment nodes are cleared by explicit node/part selection paths, not by marker cleanup.
- Normalization now defaults missing scene adjustment arrays and clamps frame-step values to whole frames.

## Verification

- `npm test`
- `npm run typecheck`
- `npm run build`

## Follow-up Fixes

- Fixed a React crash in `TimelineSelectionBox` by renaming its custom `ref` prop to `boxRef`. React treats `ref` as a special prop, which left the old value undefined when zoom/pan marquee selection rendered.
- Timeline scrubbing now blurs any active Inspector control before pointer capture starts, so Inspector fields/buttons do not keep focus while the user scrubs.
- Effects panel action labels now use only the node/effect name (`Frame Skip`, `Zoom`, `Pan`) instead of `Add ... Layer/Marker` phrasing.
