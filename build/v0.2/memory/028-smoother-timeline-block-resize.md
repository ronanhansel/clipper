# Smoother timeline block resize

Smoothed Pan and Zoom timeline marker resize handle previews.

- Resize handle drags now reuse `resizeTimelineMarkersWithPush` for the same clamping, mended-chain, and neighbor-push behavior without committing project state on every pointer move.
- During drag, changed markers are previewed imperatively with `translate3d` for start shifts and `--clipper-timeline-resize-width` for width deltas.
- Timeline marker width styles now use `calc(<duration percent> + var(--clipper-timeline-resize-width, 0px))`, allowing preview width changes without removing React-owned width styles during cleanup.
- On pointer release, the final resized marker array is committed once through `onUpdateZoomMarkers` or `onUpdateTranslationMarkers`, then preview transforms/variables are cleared.

Future notes:
- The relevant code is in `TimelinePanel`: `setTimelineMarkerResizePreviews`, `clearTimelineMarkerResizePreviews`, `updateZoomFromPointer`, and `updateTranslationFromPointer`.
- Movement and resizing now both follow the same preview-first, commit-on-release model for timeline Pan/Zoom marker bodies and handles.
