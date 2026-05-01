# 013 Translation Timeline

## Context

- User requested a new Translation timeline lane that behaves like Zoom markers, but moves the camera to an `x, y` position instead of changing scale.
- Translation markers should use the same smoothing/inspector/pick-in-screen interaction model as Zoom.
- Timeline lanes should overflow/scroll rather than shrinking too much.
- User also requested horizontal timeline zoom controls so the timeline can zoom in/out along the time axis.

## Work Log

- Started by inspecting the existing zoom marker, camera transform, and timeline lane implementation.
- Added `TranslationMarker` with `position`, `start`, `duration`, `snapIn`, and `snapOut` fields on each part.
- Added migration normalization so loaded project manifests without `translationMarkers` receive empty arrays.
- Added translation playback smoothing using the same ramp-in/ramp-out easing as zoom markers.
- Updated camera transform to combine active zoom focus/scale with active translation offset.
- Added pan marker creation, selection, deletion, dragging/resizing, inspector editing, and in-frame point picking.
- Added a third timeline lane for Translate, converted timeline content to a pixel-width scroll area, and added +/- horizontal timeline zoom controls.
- Moved timeline zoom controls to the left, added a grey range slider, constrained the timeline viewport to horizontal overflow, increased footer height, and edge-aligned first/last tick labels to prevent clipping.
- Reserved extra bottom gutter for the horizontal scrollbar so timeline zooming no longer overlays the parts row.
- Added horizontal inset to the scrollable timeline viewport so the playhead thumb is not clipped at the start/end boundaries.
- Updated sample project data, agent context, and timeline tests for the new marker field.

## Verification

- `npm run typecheck` passes.
- `npm test -- --run` passes.
