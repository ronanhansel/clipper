## Multi-Node Timeline Resize

- Timeline node resize now preserves an active multi-selection when the dragged resize handle belongs to that selection, instead of collapsing to the handle target first.
- Zoom and translation resize drags collect selected targets by `{partId, markerId}` and apply the same start/end resize delta to every valid selected marker.
- Adjustment layer resize drags collect selected adjustment layers and apply the same start/end resize delta to every valid selected adjustment node.
- Resize previews and commits are grouped by owning composition. Translation markers are still resized within their own motion layer so existing no-overlap behavior is preserved per layer.
- Single unselected marker resize still selects and resizes only the clicked marker.

Architecture note: the behavior lives in `src/components/timeline/TimelinePanel.tsx` because it coordinates pointer state, transient DOM previews, and calls the existing canonical marker update callbacks. The resize math continues to reuse `resizeTimelineMarkersWithPush` from `src/core/timeline.ts` so mended/push constraints remain shared with the previous single-marker path.
