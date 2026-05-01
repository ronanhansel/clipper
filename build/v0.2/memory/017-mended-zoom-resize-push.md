# 017 Timeline Marker Resize Push

## Summary
- Resizing a zoom marker edge that is mended to adjacent zoom markers now pushes the connected mended chain instead of only changing the selected marker.
- Dragging a right mended edge shifts the mended markers after it right/left by the same delta while resizing the selected marker.
- Dragging a left mended edge shifts the mended markers before it right/left by the same delta while resizing the selected marker.
- Resize deltas are clamped to the composition bounds and the minimum zoom duration so the chain cannot leave the part or collapse the resized marker.
- Unmended zoom and pan marker resizes now also push neighboring same-lane markers when expansion would overlap them, preserving the invariant that pan boxes and zoom boxes do not overlap within a composition.
- Timeline marker bodies use the default cursor on hover; only edge handles show the horizontal resize cursor.
- Dragging any marker in a mended pan or zoom chain now moves the full connected mended chain as one inseparable block, even if only one segment is selected.
- Mended chain movement is constrained by the full chain width and placed into one target composition, preventing a chain from being split half in one composition and half in another at composition borders.
- Dragging and dropping pan or zoom markers is strictly constrained to available same-lane gaps; markers cannot overlap other pan markers in the pan lane or other zoom markers in the zoom lane.
- The Zoom inspector scale control is a compact continuous slider from 1.00 to 5.00 with 0.01 steps and a two-decimal value display. It updates local draft state while dragging and commits to project state on release/blur to avoid lag.
- Mended zoom focus editing is allowed; focus X/Y fields and frame focus picking update every zoom marker in the connected mended chain together so shared focus remains synchronized.

## Implementation Notes
- `TimelinePanel` now uses `onUpdateZoomMarkers` for zoom handle resizing so a single drag can update multiple markers in one scene update.
- `TimelinePanel` also uses `onUpdateTranslationMarkers` for pan handle resizing so pan and zoom lanes share the same push behavior.
- `resizeTimelineMarkersWithPush` computes pushed marker bounds from the drag-start marker snapshot, keeping the drag stable while React state updates during pointer movement.
- `getMendedMarkerDragItems` expands clicked/selected pan and zoom markers into their full connected mended chain before move-drag constraints are calculated.
- `getTimelineDragConstraintItems` and `getTimelineMarkerMoves` treat mended drag groups as a single interval for composition-boundary constraints and derive member marker starts relative to the grouped placement.
- `blockDeltaForTimelineDrag` uses `getTimelineMarkerGapIntervals` so drag deltas are clamped to non-overlapping same-lane gaps before move updates are emitted.
- `updateZoomMarkerFocusGroup` uses `getMendedMarkerIds` to update focus across the connected mended zoom chain for inspector edits and frame focus picking.
- Zoom focus normalization still runs through `normalizeMendedZoomMarkerFocus` after the multi-marker update.
