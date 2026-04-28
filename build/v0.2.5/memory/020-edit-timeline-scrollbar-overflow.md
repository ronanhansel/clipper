# Edit Timeline Scrollbar Overflow

## Summary

The edit timeline could show a vertical scrollbar even with a single composition lane because the viewport height exactly matched the `58px` lane content while `overflow-x-scroll` reserved a `12px` horizontal scrollbar. Chromium then treated the lane content plus horizontal scrollbar as vertical overflow.

The timeline viewport now adds the timeline scrollbar height to its own box while keeping lane content and playhead geometry based on the original lane height.

## Architecture Note

The fix lives in `src/components/timeline/TimelinePanel.tsx` because this component owns the edit/direct lane sizing and the `timeline-scrollbar` viewport. No timeline state or interaction logic changed.

## Reuse

If timeline scrollbar sizing changes in `src/styles.css`, keep the viewport height reservation in sync with `.timeline-scrollbar::-webkit-scrollbar { height: ... }`.

## Playhead Clipping Update

The playhead overlay is clipped by the same right-column viewport area used by the ruler and timeline content. This prevents a scrolled-out playhead from rendering over the left lane labels while preserving the existing scroll transform and content-width positioning.
