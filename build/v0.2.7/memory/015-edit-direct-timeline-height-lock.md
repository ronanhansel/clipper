# Edit Direct Timeline Height Lock

## Summary
- Edit mode timeline composition rows now derive their heights from the full Direct layout instead of stretching the single visible row to fill the lane viewport.
- Direct mode no longer auto-fills leftover lane height into the last row; row heights are predictable from persisted row heights or the default row height.
- Edit mode reuses the matching Direct composition row height by layer id, so switching between Edit and Direct preserves the visible composition clip height.

## Interaction Lock
- Composition timeline blocks remain selectable in Edit mode, but timeline marker mutation affordances are disabled there.
- Edit mode no longer allows composition block dragging, left/right resizing, context-menu editing, or composition drops onto the timeline.
- Direct mode keeps the existing editable timeline behavior for composition blocks, adjustment blocks, and motion markers.

## Architecture Note
- The change stays inside `TimelinePanel` because both Edit and Direct lane layouts are local render projections of the same timeline state.
- `timelineMarkersEditable` is intentionally derived from `mode === "composition"`; future timeline marker mutation UI should respect that gate so Edit remains a canvas/object editing surface and Direct remains the timeline editing surface.
