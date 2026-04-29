# Timeline Label Rail Scroll And Compact Controls

## Summary
- Wheel/trackpad scrolling over the left timeline label rail now scrolls the main timeline viewport vertically and horizontally.
- Layer controls now hide the lock button before the visibility eye when rows become short.
- Locked layer labels render red to make locked rows visually obvious.

## Architecture Notes
- The label rail still mirrors the main timeline viewport via `saveTimelineDisplacement`; wheel input over the rail forwards deltas to `timelineViewportRef` so there is one canonical scroll position.
- `LayerLabel` now separates `compactControls` for the visibility eye from `hideLockControl` for the lock button, letting the lower-priority lock disappear earlier.

## Reuse
- Keep future label-rail scroll behavior routed through the main timeline viewport to avoid desynchronizing labels and lanes.
- When adding more compact controls, hide lower-priority actions before hiding visibility/menu controls.
