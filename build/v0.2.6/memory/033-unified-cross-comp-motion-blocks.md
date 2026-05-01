## Unified Cross-Composition Motion Blocks

- Motion marker resize now operates in scene-absolute time, so zoom, pan, rotate, and perspective blocks can resize across composition boundaries like adjustment blocks resize across the full scene.
- Resized motion blocks commit through new `onResizeZoomMarkers` and `onResizeTranslationMarkers` callbacks. `App.tsx` splits resized markers back across timeline compositions using the existing `splitMarkerAcrossTimelineRanges` and overwrite flow, preserving persisted per-composition runtime data.
- `resizeTimelineMarkersWithPush` in `src/core/timeline.ts` now accepts generic min/max bounds, so the same push/mended resize logic works for composition-local ranges and scene-wide ranges.
- Timeline block rendering is shared through `TimelineBlock` in `src/components/timeline/TimelinePanel.tsx`; adjustment, zoom, and translation blocks now use the same component, handle structure, selection styling, and resize entry points.

Architecture note: timeline pointer orchestration remains in `TimelinePanel` because it owns transient DOM previews and rAF scheduling. Canonical cross-composition persistence remains in `App.tsx` because it owns project mutation and marker splitting. Future block variants should render via `TimelineBlock` and use the scene-absolute resize helpers rather than adding parallel block DOM or local composition-bound resize logic.
