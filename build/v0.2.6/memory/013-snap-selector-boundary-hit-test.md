# Snap Selector Boundary Hit Test

## Status

Implemented a focused fix for snap selector selection at marker boundaries.

## Implemented

- Changed `getTopTimelineItemAtTime` marker and adjustment hit testing to use half-open selection ranges (`start <= time < end`) instead of inclusive ends.
- This prevents a pan/rotate or adjustment block that ends exactly at the snapped scrubber from masking a zoom block that starts or remains active at that same playhead time.
- Added a regression test covering a pan marker ending at the scrubber while a zoom marker starts there; snap selector now resolves to the zoom marker.
- Added `getTimelineMotionLayersWithMarkers`, which appends visible motion rows for any marker `layerId` present in the active timeline but missing from editor layer state.
- `TimelinePanel` and preview hidden-layer derivation now use the recovered layer list, so marker data in the timeline cannot remain selectable while hidden from the timeline UI.
- Removing a motion layer now also deletes every zoom/pan/rotate marker on that layer from the active timeline in the same project update, so there are no hidden blocks left to recover later.
- Snap selector now passes the visible motion-layer order into `getTopTimelineItemAtTime`; when multiple marker rows overlap at the playhead, selection follows top-to-bottom timeline row order instead of always prioritizing pan/rotate markers over zoom markers.

## Architecture Note

- The fix lives in `src/core/timeline.ts` because snap selector uses the shared top-item lookup from `TimelinePanel`, and the bug is boundary hit-test semantics rather than rendering state.
- `isMarkerAtSceneTime` remains inclusive for runtime/preview use; only selector-specific hit testing uses half-open intervals.
- The active timeline remains the source of truth for marker visibility: editor layer state controls ordering/naming/hidden flags, but rows are recovered from actual timeline marker data when the saved layer state is incomplete.
- Selection priority is now aligned with visible timeline rows: adjustment first, motion rows in their rendered order, then composition clips.
- Reuse `removeTimelineMotionLayerMarkers` for future timeline-layer deletion paths; do not remove only the layer metadata without also removing or moving its marker data.
