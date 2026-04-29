# Timeline Layer Icon Column

## Update

- Timeline layer visibility and options controls now render as a compact vertical icon column in `src/components/timeline/TimelinePanel.tsx`.
- The options ellipsis is placed above the visibility eye control.
- Timeline layer names are top-aligned in the same row so resizing a layer no longer shifts the title vertically.
- Timeline layer rows can shrink to 42px again; rows under 52px hide the standalone eye icon and keep layer enable/disable available in the ellipsis menu.
- The controls stay in `LayerLabel` so layer label rendering remains the single place responsible for per-row timeline controls.

## Architecture Note

- This is a presentation-only change scoped to the existing timeline label component. Reuse `LayerLabel` for future per-layer controls rather than adding separate rail overlays.
