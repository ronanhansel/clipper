# 006 Zoom Marker Inspector

## Context

- User requested that left-clicking a zoom block should select it and show zoom-specific properties in the right inspector instead of the normal video/object inspection.
- The zoom inspector needs controls to change focal point and delete the zoom block.

## Work Log

- Added selected zoom marker state `{ partId, markerId }` and clear it when selecting frame objects, drawing selections, or selecting parts.
- Selecting a timeline zoom marker now highlights the marker and opens a dedicated `ZoomInspector`.
- The zoom inspector edits start, duration, focus X/Y, and scale, all clamped to the containing part and fixed frame dimensions.
- Added a delete action for the selected zoom block.
- Added keyboard delete support: Backspace/Delete removes the selected zoom block unless focus is inside an input, textarea, select, or contenteditable field.
- New zoom markers are selected immediately after creation.
- Dragging/resizing zoom markers also selects them, so the inspector follows the active zoom edit target.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes.
