# Smoother timeline block move

Smoothed Pan and Zoom timeline marker movement previews.

- Marker body drags in Direct mode no longer update project state on every pointer-move rAF.
- Pan/Zoom marker elements now expose `data-timeline-marker-kind`, `data-timeline-marker-part-id`, and `data-timeline-marker-id` for targeted preview transforms.
- Move drags reuse the existing snap, mended-chain, composition-boundary, and no-overlap constraint math, but apply the constrained delta as an imperative `translate3d` transform during drag.
- On pointer release, the existing move callbacks commit the final marker placement once, then the temporary transforms are cleared on the next animation frame.
- Resize handle drags are intentionally unchanged; they still commit during movement because resizing can push neighboring markers and changes marker widths.

Future notes:
- The relevant code is in `TimelinePanel` around `updateZoomFromPointer`, `updateTranslationFromPointer`, `setTimelineMarkerDragTransforms`, and `clearTimelineMarkerDragTransforms`.
- If resize still feels heavy, apply a separate preview model for width/position changes and pushed neighbor markers.
