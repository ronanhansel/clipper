# Adjustment Marker Composition Separators

## Goal

Show the white composition separators while moving adjustment markers, matching the visual context available during composition/timeline movement previews.

## Notes

- Started from the timeline marker drag-preview path in `src/components/timeline/TimelinePanel.tsx`.

## Implementation

- Reused the existing `TimelineBoundaryGuides` overlay instead of adding a new separator implementation.
- The guide overlay now renders when `isDraggingAdjustmentLayer` is active, alongside the existing motion-marker and effect-drag cases.

## Architecture Note

- The feature lives entirely in `TimelinePanel` because the separator overlay and drag-state flags are already local to the timeline rendering boundary.
- Future timeline drag affordances should reuse `TimelineBoundaryGuides` for composition boundary visibility rather than duplicating guide markup per lane or marker type.
