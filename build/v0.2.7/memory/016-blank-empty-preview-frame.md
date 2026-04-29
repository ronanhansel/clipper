# Blank Empty Preview Frame

## Summary
- Interactive preview no longer shows the centered "Timeline has no compositions" card when the active timeline has no composition at the scrubber.
- The empty state now renders a black 1920x1080 preview frame scaled by the existing preview zoom value, so the center stage preserves its editing-frame affordance even before content is present.

## Architecture Note
- The change stays in `App.tsx` beside the existing `FramePreview` branch because this is a local render fallback for the preview column, not a composition runtime concern.
- Future empty-preview styling should reuse `FRAME_WIDTH`, `FRAME_HEIGHT`, and `framePreviewScale` so zoom controls keep behaving consistently with populated previews.
