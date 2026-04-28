# Motion Block Layer Snap

## Status

Implemented a focused fix for vertical motion block dragging across timeline layers.

## Implemented

- Kept the existing vertical drag preview path in `TimelinePanel`, which computes whole-row Y offsets from `layerRowStarts` so blocks snap directly to target layers.
- Changed `ZoomLane` and `TranslationLane` to use `overflow-visible` only while a motion block is actively being dragged. This prevents the dragged block from being cropped by its source lane as it snaps up or down into another layer.
- Updated active drag previews to adopt the destination layer height when rows have different heights, so the whole block lands inside the target layer instead of spanning two rows.
- Made marker drag collision constraints layer-aware, so zoom/pan/rotate markers on other motion layers no longer block horizontal movement or composition-boundary snapping.
- Boundary guide stripes now render as one timeline-wide overlay during marker drags, spanning every layer vertically like the playhead instead of being clipped inside individual lanes.
- Layer ellipsis menus now render through a React portal so the rail scroll/overflow container cannot clip or hide them.
- Vacant non-empty motion rows can be retagged to the dragged marker kind on commit, which lets empty rows named Pan/Zoom/New Motion accept the first dropped motion block.
- Timeline marker, adjustment, and row-resize drags add `clipper-timeline-dragging-no-hover` only to the timeline container, disabling timeline hover hit-testing while the drag is active without affecting the rest of the app.
- Pan/rotate resize now computes push constraints only against markers on the same motion layer, then merges the resized layer markers back into `translationMarkers`. This avoids pan and rotate blocking each other because they share the same underlying marker array.
- Preserved normal `overflow-hidden` lane behavior outside active drags so marker contents, selections, and lane visuals remain clipped during regular timeline use.

## Architecture Notes

- The fix stays in `src/components/timeline/TimelinePanel.tsx` because it is purely interaction rendering state; canonical marker layer changes still commit through the existing timeline move callbacks.
- Layer-aware drag constraints live beside timeline interaction code for now because target layer selection is pointer-position dependent. If reused elsewhere, extract a pure helper that accepts a target layer id and marker-layer resolver.
- Reuse this pattern for future cross-lane drag previews: compute canonical target rows with core/timeline state, preview with rAF-driven transforms, and relax lane clipping only for the active drag window.
