# Blank Timeline Paste Context Menu

## Summary
- Blank timeline lanes now open an app context menu on right-click.
- The blank menu currently exposes Paste and anchors paste placement to the clicked timeline time instead of the current playhead time.
- Node context menus continue to use the existing copy, cut, paste, and delete flow, but Paste now also anchors to the clicked timeline time.
- Paste placement clamps the copied node start to the scene bounds, not `sceneDuration - node.duration`, so the pasted marker/block starts at the clicked time and extends to the right.

## Architecture Notes
- `TimelinePanel` owns hit testing for blank lane right-clicks because it already converts pointer positions to timeline time via `timeFromClientX`.
- `App` owns clipboard mutation and paste semantics, so `TimelinePanel` passes a `TimelineBlankContextTarget` with the computed time to `openTimelineBlankContextMenu`.
- `TimelineNodeContextTarget` can also carry the clicked time. This keeps node menus selection-aware while ensuring Paste starts the copied block or marker at the point where the menu was opened.
- `pasteTimelineNodes` accepts an optional target start; callers without a target preserve the previous playhead-based paste behavior.

## Reuse
- Use `onOpenBlankContextMenu` for future timeline-background menu actions that need a timeline time.
- Keep node-specific context menus on `onOpenNodeContextMenu` so selection-aware copy/cut/delete behavior stays isolated from blank-space actions.
