# 013 Full Code Preview

## Context

- User requested the code preview to fill the center workspace instead of staying capped in a smaller centered panel.
- The status/error row was clipped at the bottom of the code panel when the textarea consumed too much height.

## Work Log

- Updated the center workspace wrapper in `src/App.tsx` so Code mode stretches its child while Interactive mode remains centered.
- Reworked `CodePane` as a three-row grid: header, flexible textarea, and status/error footer.
- Removed the `980px` width cap and fixed-height textarea calculation so the code preview fills the available center space and the status/error footer remains visible.
- Removed Code mode content padding and the outer rounded/bordered panel frame so the editor occupies the entire center content area edge-to-edge.

## Verification

- `npm run typecheck` passes.
