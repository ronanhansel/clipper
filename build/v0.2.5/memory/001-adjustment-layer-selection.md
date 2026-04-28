# Adjustment Layer Selection

## Context

The timeline adjustment lane should behave like other timeline node lanes: dragging empty lane space performs marquee selection, selected nodes can be deleted with Backspace/Delete, and the lane has normal layer height instead of acting as a scrub-only strip.

## Architecture Notes

- `TimelinePanel` owns lane-local pointer gestures and transient marquee previews.
- `App` owns canonical selected-node state and project mutation/deletion.
- Adjustment-layer deletion should reuse `deleteTimelineClipboardNodes` where possible so keyboard deletion, context-menu deletion, and cut/delete semantics remain aligned.

## Implementation

- Added `AdjustmentLayerSelection` and `selectedAdjustmentLayers` to the editor store.
- The adjustment timeline lane now uses marquee selection handlers instead of scrub handlers, matching pan and zoom lanes.
- The adjustment lane row now uses the same 58px height as other timeline layers.
- Backspace/Delete removes the selected adjustment layer set through the shared timeline-node delete path.
- Clicking blank space in adjustment, pan, or zoom lanes clears timeline node selection while still scrubbing to that time.
- The timeline footer is constrained to its fixed app row and the lane body owns vertical overflow scrolling.
- The label column and timeline strip now keep a fixed full lane-content height so the shared lane body can scroll vertically instead of clipping the comp row.
- Extracted `TimeRuler` so the ruler is outside the vertical lane scroller.
- The playhead now uses a shared CSS-variable container: the cap renders in the sticky ruler and the tail renders inside the scrollable lanes.
- Blank lane clicks explicitly clear timeline selection, preview the playhead position, and commit `onScrub` without requiring a drag gesture.
- Scrub preview now uses the same percent-based `--clipper-playhead-left` positioning as React/playback updates, avoiding pixel/percent position conflicts that made the playhead snap back and forth.

## Verification

- `npm run typecheck`
- `npm test`
