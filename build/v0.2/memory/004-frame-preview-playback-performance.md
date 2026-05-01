# Frame Preview Playback Performance

## Context

- User wants playback and scrubbing to feel speedier, especially the fixed frame preview.
- Previous v0.2 scrub work batched high-frequency scrub writes through `requestAnimationFrame`, but accepted time updates still trigger broad React work.

## Work Log

- Started a pass to isolate and memoize frame preview rendering so playback/scrub ticks do less repeated work.
- Extracted the fixed frame preview into a memoized `FramePreview` component.
- Memoized frame objects and background elements with custom comparisons so static preview elements skip time-only updates.
- Cached split text lines inside preview elements instead of recalculating them directly in render output.
- Switched active timeline part lookup to binary search for cheaper playback/scrub time resolution as scenes grow.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.
