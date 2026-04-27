# 017 Zoom Snap And Toast Errors

## Context

- User requested zoom marker snap-in/snap-out behavior, visual square edges for snapped zoom blocks, themed `react-hot-toast`, and overlap prevention when adding zooms.

## Work Log

- Added optional `snapIn` and `snapOut` fields to `ZoomMarker`.
- Added Snap In and Snap Out toggles to the zoom inspector.
- Updated zoom preview interpolation so `snapIn` skips the zoom-in ramp and `snapOut` skips the zoom-out ramp.
- Updated timeline zoom blocks so snapped left/right edges render square instead of rounded.
- Installed `react-hot-toast`, added a top-center themed `Toaster`, and use `toast.error` for zoom overlap errors.
- Prevented adding a new zoom marker when its default placement overlaps an existing zoom marker in the active part.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes, with the existing Vite large chunk warning for the TypeScript editor bundle.
