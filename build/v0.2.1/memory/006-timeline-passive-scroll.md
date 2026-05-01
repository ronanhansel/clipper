# Timeline Passive Scroll

## Goal

Stop the timeline viewport from forcing the playhead to remain visible during normal scrolling. Users should be able to scroll away from the current playhead position.

## Architecture Note

Timeline scrolling is handled in `TimelinePanel` in `src/App.tsx`. Passive playhead-follow behavior was removed from the `currentSceneTime` effect; the only remaining horizontal auto-scroll is the scrub-specific edge loop driven by `scrubClientXRef` and `scheduleScrubAutoScroll`.

Future changes should keep automatic timeline scrolling tied to explicit pointer scrubbing or playback requirements, not general `currentSceneTime` updates.

## Implemented

- Removed the passive viewport recentering effect that kept the playhead visible after time changes.
- Preserved scrub edge auto-scroll so dragging the scrubber near the viewport edge still scrolls the timeline.
