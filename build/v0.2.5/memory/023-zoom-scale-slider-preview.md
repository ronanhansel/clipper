# Zoom Scale Slider Preview

## Context
- The zoom marker scale slider should show both its numeric value and camera zoom effect in real time while dragging.
- The previous live preview reused the scrub/playback rAF pattern but still wrote every preview frame into the global editor store, causing `App` and derived editor state to re-run during slider movement.

## Implementation
- `ZoomInspector` keeps the visible slider label as local `draftScale` state and still commits the marker scale only on pointer/key/blur finalization.
- `App.previewZoomScale` now computes the active zoom/translation transform for the current preview frame and applies it imperatively to the preview camera element on the next rAF.
- Removed `liveZoomScalePreview` from the editor store and derived state so slider drags do not invalidate global editor state.

## Architecture Note
- This follows the playback/scrub optimization rule: transient visual feedback stays local or DOM-imperative in the interaction hot path, while canonical project state is committed once when the interaction finalizes.
- Future camera-effect slider previews should reuse the same shape: compute the deterministic preview transform from core camera helpers, update only the affected preview element during pointer movement, and avoid project/editor-store writes until release.

## Verification
- `npm run typecheck` passes.
- `npm test` passes.
