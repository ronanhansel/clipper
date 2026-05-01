# 006 Linear Timeline Playback

## Context

- User reported that pressing play made the timeline move inconsistently, slowing down and speeding up instead of progressing linearly.

## Work Log

- Fixed the playback loop in `src/App.tsx` so it no longer depends on `currentSceneTime` and therefore no longer restarts the animation effect after every playhead update.
- Changed timeline playback to advance by the real elapsed delta between `requestAnimationFrame` callbacks.
- Added a separate end-of-scene guard that stops playback when the playhead reaches the scene duration.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.
