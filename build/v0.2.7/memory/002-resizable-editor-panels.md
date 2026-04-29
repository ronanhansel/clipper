# Resizable Editor Panels

## Goal

Enable user-resizable left panel, right inspector panel, and bottom timeline panel in the main editor shell.

## Architecture Note

- Panel dimensions belong to `EditorState.layout` so projects persist the user's workspace layout alongside other editor-only viewport state.
- Drag interaction should remain local to `App.tsx` and use CSS variable previews during pointer movement, committing canonical project state once on pointer release/cancel.
- Reuse this layout state and handle pattern for future shell regions rather than adding one-off fixed grid classes.

## Implementation

- Added `EditorLayoutState` with `leftPanelWidth`, `rightPanelWidth`, and `timelineHeight`.
- Added `defaultEditorLayoutState` and normalization clamps in `src/core/project.ts`.
- Main editor shell now uses CSS variables for grid columns/rows and absolute separator handles for left, right, and timeline resizing.
- Pointer movement updates only root CSS variables through `requestAnimationFrame`; `EditorState.layout` is updated once at drag end.
- Layout updates now use the implicit project save path after drag commit, so resizing panels persists without requiring the Save button.
- Timeline resize handle is an 8px hit target centered on the timeline edge with `bottom: calc(var(--clipper-timeline-height) - 4px)`.
