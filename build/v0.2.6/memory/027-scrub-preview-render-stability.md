# Scrub Preview Render Stability

## Context

- Small timeline scrubs could make the playhead stutter back toward the pointer-down position.
- The scrub interaction previews playhead motion imperatively, but throttled scrub commits still update React state during pointer capture.

## Architecture Note

- `TimelinePanel` continues to own transient scrub input, rAF preview movement, throttled commits, and final immediate release commits.
- The latest pointer-derived preview time is cached in `latestScrubPreviewTimeRef` and restored in a layout effect while `scrubbingRef` is active.
- This keeps canonical time commits throttled while preventing React renders with older committed `currentSceneTime` from overwriting the live playhead CSS variable before paint.

## Implemented

- Added a scrub preview time ref next to the existing pending scrub refs.
- Updated `previewScrubTime` to cache the latest preview time.
- Added a render-safe layout effect that reapplies the latest preview during active scrub renders.
- Cleared the preview cache after the final immediate scrub commit on release/cancel.

## Verification

- `npm run typecheck` passes.
