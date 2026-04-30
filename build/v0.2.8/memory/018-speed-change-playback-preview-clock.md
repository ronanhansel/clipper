# v0.2.8 Speed Change Playback Preview Clock

## Summary

Fixed high-speed Speed Change playback so the preview no longer applies the speed remap a second time after the playback clock has already accelerated absolute scene time.

## Architecture Notes

- `src/core/adjustments.ts` now exposes `applyPlaybackAdjustmentLayersToSceneTime`, which applies active adjustment time remaps except time-sensitive display-clock effects.
- Playback remains responsible for accelerating the absolute scene playhead through `advanceTimeSensitiveSceneTime`.
- `FramePreview` uses the playback-specific remap only for live playback ticks. Normal scrubbing and still preview derivation continue to use `applyAdjustmentLayersToSceneTime`, so manually controlled absolute time still previews the adjusted content mapping.
- Playback part-change detection also uses the playback-specific remap, preventing speed layers from selecting source compositions as if speed were applied twice.

## Status

- Added regression coverage for the 8x case: after 0.25s of wall-clock playback from a speed node, the playhead and preview both resolve to scene time 7 instead of the preview jumping near the layer end.

## Verification

- `npm test -- src/core/renderRuntime.test.ts`
- `npm run typecheck`
