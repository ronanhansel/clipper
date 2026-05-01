# Effect Drag Ghost Position

## Goal
- Keep the custom Effects panel drag ghost visually close to the cursor while dragging effect packages onto the timeline.

## Architecture Notes
- The custom drag ghost is owned by `src/components/ToolsPanel.tsx` because effect drags originate from the Effects tools panel and already dispatch pointer-based timeline preview events from there.
- Timeline drop previews remain in `src/components/timeline/TimelinePanel.tsx`; the ghost position fix does not change timeline placement or drop semantics.

## Implemented
- Changed the effect drag ghost offset from lower-right of the cursor to a small right-and-up offset so the badge tracks close to the pointer without covering it.
