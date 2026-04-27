# Multi-Node Drag

## Goal
- Allow dragging a selected node group in the frame editor so every selected node moves by the same pointer delta.

## Notes
- `src/App.tsx` stores marquee-selected nodes in `selectionPayload`.
- Before this change, `ObjectDrag` tracked only one `objectId` and one starting `bounds`, so `startObjectDrag` collapsed selection to the dragged object.

## Implementation
- `ObjectDrag` now snapshots all selected objects when the pointer-down target is already part of `selectionPayload`.
- Drag movement computes one pointer delta and applies it to every snapped object, clamping each object independently to the frame bounds.
- The selection payload and object outlines are updated during drag so the multi-node selection remains visible and current.
- Timeline zoom and translation markers now preserve multi-selection on pointer-down when the dragged marker is already selected.
- Bulk timeline marker moves compute the same time delta for every selected marker, allow markers to cross part boundaries independently, and update selected marker part IDs as markers move.
- Multi-selected timeline markers now compute a single shared block delta before placement. When snapping is active, the group's left or right edge snaps to part boundaries and every selected marker receives the same snapped displacement.
- The shared block delta is constrained to positions where every selected marker can fit exactly inside a part. This prevents individual marker clamping at part boundaries from splitting the selected block apart.

## Verification
- `npm run typecheck`
- `npm test`
