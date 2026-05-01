# Freeform Timeline Marquee

## Status

Implemented freeform timeline marquee selection across multiple layers.

## Implemented

- Timeline marquee selection now tracks both X and Y instead of being constrained to a lane-height rectangle.
- Dragging across adjustment, zoom, pan, and rotate rows can select nodes from all intersected layers in one gesture.
- `TimelinePanel` now reports combined adjustment/zoom/translation selections to `App` through a dedicated `onSelectTimelineNodes` callback so selection types do not clear each other during marquee selection.
- Delete/Backspace now removes all selected timeline node types together when mixed timeline selections are active.

## Architecture Notes

- The hit-testing remains in `TimelinePanel` because it depends on rendered row order, row heights, layer ids, and the live timeline viewport rectangle.
- Canonical mixed selection state remains in `App.tsx`, where existing timeline node selection, deletion, and project mutations already live.
- Future timeline marquee changes should reuse this combined-selection path rather than calling the single-kind selection callbacks, because those intentionally clear other node kinds for direct-click interactions.
