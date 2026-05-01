# 008 First Block Animated Preview

## Context

- User requested the project first block to show a fade-up text animation, then a box floating down, then a typewriter effect on the subtitle.
- The editor had motion metadata strings but the frame preview did not yet render object animation state over time.

## Work Log

- Updated the first sample part (`prt_grid_reveal`) with clearer animation metadata:
  - `hero-title`: fade-up text.
  - `hero-panel`: delayed float-down box with subtle ongoing drift.
  - `object-rule`: typewriter subtitle.
- Added preview-time animation computation in `FrameObjectView` so playback and timeline scrubbing visibly animate those first-block objects.
- Typewriter subtitle reveals characters over the part-local preview time and shows a blinking cursor while incomplete.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes.
