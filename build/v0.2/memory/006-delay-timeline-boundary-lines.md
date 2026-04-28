# Delay Timeline Boundary Lines

## Context

- In Direct timeline mode, clicking a Pan or Zoom block immediately showed the composition boundary separator lines.
- The desired behavior is to keep simple selection clean and only show those separator lines once the marker is actually dragged.

## Work Log

- Updated timeline marker pointer handling so Pan/Zoom boundary separators are enabled only after pointer movement crosses the existing drag threshold.
- Simple clicks still select markers, but no longer enter the visual dragging state.

## Verification

- `npm run typecheck` passes.
