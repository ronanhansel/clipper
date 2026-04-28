# Detailed Timeline Ruler

## Context

- User wants the timeline ruler to look more detailed with long and short ticks.
- User also wants playhead seeking to happen only from the ruler, not from empty timeline lane clicks.

## Architecture Note

- `TimelinePanel` remains the owner of timeline ruler pointer scrubbing and lane selection drags.
- Ruler seeking is isolated to `TimeRuler` pointer handlers; empty composition, pan, zoom, and adjustment lane clicks do not call `onScrub`.
- Ruler visual detail is kept local to `TimeRuler` with generated tick marks, while labeled major ticks still use `getTimelineTicks` from `src/core/timeline.ts`.
