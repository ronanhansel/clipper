# Mended Marker Resize Groups

Timeline motion marker resizing now uses the mended-aware `resizeTimelineMarkersWithPush` helper from `src/core/timeline.ts` instead of the free single-marker resize path.

When a zoom or translation marker edge is resized, adjacent mended markers on that side move with the resized edge so the mended chain stays contiguous during both expansion and contraction. `TimelinePanel.tsx` uses the same helper for live DOM previews and final resize commits, so preview and persisted state match.

Tests in `src/core/timeline.test.ts` cover resizing an end edge and a start edge for three-marker mended chains.
