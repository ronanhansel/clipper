# Resizable Blank Spacers

## Goal

Allow users to resize blank spacer parts directly from the parts timeline by dragging their left or right borders.

## Notes

- The interaction belongs in `TimelinePanel` in `src/App.tsx`, where parts and zoom blocks are rendered.
- Zoom blocks already use pointer-driven edge resize handles; blank spacer parts should follow the same direct-manipulation model.
- Blank parts are timeline entries with `kind: "blank"` and their length is controlled by `duration`.

## Implementation

- Added transparent hover handles to the left and right edges of blank parts in the parts row.
- Dragging the right handle increases or decreases spacer duration with pointer movement.
- Dragging the left handle uses inverse pointer movement so dragging inward shortens the spacer and dragging outward lengthens it.
- Spacer durations are rounded to tenths and clamped to `0.2s` through `MAX_PART_DURATION_SECONDS`.
- Hover feedback is a straight border highlight on the actual edge, not a rounded overlay, so spacers between other parts keep square shared borders.
