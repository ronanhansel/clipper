# Smoother marquee drag

Smoothed the edit-page marquee selection preview.

- The marquee rectangle is still mounted by React when a drag starts, but pointer-move updates no longer call `setDragBox` every animation frame.
- `scheduleDragBox` now writes the marquee box position and size directly to the overlay element with `translate3d`, width, and height inside the existing rAF loop.
- Live object selection is preserved during marquee drag, but selection state updates are wrapped in `startTransition` so they are less likely to block the visual rectangle update.
- `dragBox` state remains for mount/cleanup and final pointer-up fallback, while `pendingDragBoxRef` remains the source of truth for in-flight geometry.

Future notes:
- The relevant code is in `src/App.tsx`: `scheduleDragBox`, `DragSelectionBox`, and `updateDragSelectionBoxElement`.
- If selection changes still feel heavy with many objects, throttle `createSelectionPayload` separately from visual marquee drawing.
