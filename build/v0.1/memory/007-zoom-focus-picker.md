# 007 Zoom Focus Picker

## Context

- User requested a target button next to Focus Y in the zoom inspector.
- Pressing the target button should temporarily reset the frame viewer zoom so the user can select a new focal point directly from the fixed frame.

## Work Log

- Added focus-pick state for the selected zoom marker.
- Added a Lucide `Crosshair` button beside the Focus Y input in `ZoomInspector`.
- While focus-pick is active, active zoom preview is disabled so the frame viewer is reset/unzoomed.
- Clicking inside the fixed frame during focus-pick writes the clicked frame coordinate to the selected zoom marker `focus` and exits focus-pick mode.
- Added visual crosshair/ring treatment while focus-pick mode is active.
- Removed the contextual helper prompt under the zoom inspector controls.
- Fixed focus-pick priority so clicks on frame objects are captured by the frame before object selection/drag handlers, and objects use a crosshair cursor instead of grab while picking focus.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes.
