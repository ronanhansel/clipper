# Timeline Resize Handles

## Summary

Timeline resize handles for adjustment layers, pan markers, and zoom markers were widened from `w-1` to `w-2` and extended to the full node height. This keeps the visible edge affordance simple while making the pointer target easier to hit.

Timeline node rounding was then removed from adjustment, pan, and zoom nodes and their resize handles so the resized edges stay square and easier to visually target.

The resize handle hit areas were later made transparent, removing the visible differently coloured edge strips while preserving the larger pointer target.

Mended pan/zoom edges now show only a teal border line on snapped edges. The line is visual only; the transparent full-height `w-2` resize hit area remains unchanged. The mend line was later expanded to the full node height and thickened to `2px` for readability.

## Architecture Note

The change lives in `src/components/timeline/TimelinePanel.tsx` because the resize affordances are rendered inline with each timeline node and already delegate to the existing pointer handlers. No resize behavior or canonical timeline state logic changed.

## Reuse

Future timeline node types should use the same full-height `w-2` edge handle pattern so resize targets stay consistent across lanes.
