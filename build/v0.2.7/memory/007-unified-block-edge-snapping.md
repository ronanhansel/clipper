# Unified Block Edge Snapping

Timeline block move snapping now uses `snapTimelineBlockStartToBoundary` in `src/core/timeline.ts` so moved blocks can snap by either their front/start edge or their back/end edge.

`src/components/timeline/TimelinePanel.tsx` reuses this helper for motion marker drags, adjustment layer moves, composition moves, and adjustment/motion effect-drop previews. This removes the previous discrepancy where motion blocks considered both edges while adjustment layers only snapped the start edge during moves.

Architecture note: the edge-snapping rule lives in `src/core/timeline.ts` because it is timeline-domain behavior shared across marker categories. Pointer interaction code in `TimelinePanel.tsx` remains responsible only for deriving candidate starts, applying previews, and committing rounded state.
