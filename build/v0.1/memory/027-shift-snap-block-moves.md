# Shift Snap Block Moves

## Goal
- Make timeline block movement for zoom and translation markers snap while Shift is held, matching the temporary magnetic scrub behavior.

## Notes
- Timeline interactions live in `src/App.tsx`, primarily inside `TimelinePanel`.
- Existing magnetic scrub support uses `shiftSnapActive` and `isScrubSnapActive` for scrubber movement.

## Implementation
- Replaced the always-snap marker placement path with `getMarkerPlacement`, which only snaps when the drag event has `shiftKey` active.
- Shift snapping uses part, zoom, and translation boundaries, matching magnetic scrub, while excluding the marker being dragged so it does not stick to its own original edge.
- Zoom and translation move drags both track `shiftKey` during pointer movement and on pointer up.
- Zoom inspector snap controls now always show In, Middle, and Out; In/Out apply to every selected zoom block even when Middle is available.
- Multi-selection snap active state is derived from all selected zoom markers, not only the selected marker's part.
- Middle snap is highlighted when selected adjacent zoom blocks already share an edge with the `snapOut`/`snapIn` pattern; clicking active Middle clears those edge snap flags without moving the blocks.
- Timeline zoom, translation, and part blocks now use thin inset black rings so adjacent blocks remain visually separable without heavy borders.
- Zoom and translation lasso selection now updates live during pointer movement as soon as the selection highlighter intersects blocks, instead of waiting for pointer release.
- Translation inspector now mirrors zoom snap controls: In, Middle, and Out support multi-selection, Middle snapping, active highlighting, and toggling off the middle snap pattern.
- Zoom and translation inspector delete buttons now use normal-size text and the shorter label `Delete`.
- Selected middle-snap detection now tolerates tiny overlaps/gaps and near-minimum durations between adjacent selected blocks, matching the playhead middle-snap tolerance so visually adjacent translation blocks can enable Middle.

## Verification
- `npm run typecheck`
- `npm test`
