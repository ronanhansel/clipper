# Playhead Shift Snap Boundary

## Status

Implemented shift-snap support for using the current playhead line as a timeline block boundary.

## Implemented

- Timeline adjustment-layer move/resize shift snapping now includes `currentSceneTime` in its boundary list.
- Motion marker block move/resize shift snapping now includes `currentSceneTime` in addition to composition and marker boundaries.
- Boundary lists are deduplicated and sorted before they reach `snapScrubTimeToBoundary`, preserving the binary-search assumption used by existing snapping.

## Architecture Notes

- The change stays in `src/components/timeline/TimelinePanel.tsx` because the playhead time is live UI/editor state and the existing drag preview path already owns shift snapping.
- Core timeline helpers remain unchanged so non-interactive placement and marker-boundary calculations are not coupled to playhead state.
