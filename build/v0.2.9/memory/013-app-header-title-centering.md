# App Header Title Centering

## Goal

Keep the app bar project title visually centered in the window instead of centering it inside the space left over by unequal left and right header items.

## Implementation Notes

- `src/app/shell/AppHeader.tsx` now makes the header a relative two-column layout for the empty left spacer and right actions.
- The project title cluster is absolutely positioned at `left-1/2 top-1/2` with translate centering and a bounded desktop width, so its center is independent of side item widths while long names still truncate.
- The title keeps `appNoDragRegion` and `pointer-events-auto` so context-menu renaming and the rename input remain interactive inside the draggable Electron header.

## Verification

- `rtk npm run typecheck` passes.
