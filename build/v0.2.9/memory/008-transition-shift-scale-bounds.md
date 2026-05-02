# Transition Shift Scale Bounds

## Change
- Fixed single transition Shift-resize scaling so symmetric resizing around the midpoint remains bounded by the timeline start and end.
- When either side reaches the timeline edge, further Shift-resize growth stops instead of allowing the opposite transform path to push the transition outside the timeline.

## Architecture Note
- The fix stays in `DirectTimelinePanel.updateTransitionFromPointer()` because the behavior is specific to transition midpoint scaling; shared block timing already clamps ordinary single-edge resize before the transition-specific symmetric transform runs.
- The helper clamps the symmetric in/out duration to the available distance from the midpoint to both timeline edges, preserving midpoint-centered scaling and existing minimum-duration behavior.

## Verification
- `rtk npm run typecheck` passes.
