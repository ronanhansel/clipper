# Shift Axis Object Drag

## Summary

- Added Shift-constrained object movement on the edit frame.
- While dragging selected frame objects, holding Shift locks movement to the dominant horizontal or vertical axis.

## Architecture Note

- Axis locking lives in `src/core/frameInteraction.ts` as `constrainDragDeltaToDominantAxis` so the pointer UI path stays thin and the movement rule is testable.
- `src/App.tsx` applies the constraint before scheduling the rAF object-drag preview, so the same constrained delta is used for both transient preview and pointer-up commit.
- Future move constraints should reuse the frame interaction helper layer rather than adding one-off pointer math inside the React component.
