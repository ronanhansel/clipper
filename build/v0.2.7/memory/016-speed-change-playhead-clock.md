# v0.2.7 Speed Change Playhead Clock

## Summary

Fixed playback clock handling for time-sensitive Speed Change adjustment layers so the timeline playhead responds to speed layer changes during playback.

## Architecture Notes

- Time-sensitive playback remains centralized in `src/core/adjustments.ts` through display-time mapping helpers.
- `App.tsx` owns the playback clock because it coordinates the timeline playhead, preview, and playback scrubber.
- Executable adjustment layers are memoized before use by playback and preview paths so effects depend on the actual visible adjustment set rather than a freshly created array every render.

## Status

- Playback now reseeds its wall-clock anchor from the current scene time when the executable adjustment layer set changes while playing.
- The playback rAF effect now depends on `visibleSceneAdjustmentLayers`, so Speed Change parameter edits and adjustment row visibility changes are reflected immediately.
- The playback clock reseed is keyed by a serialized visible-adjustment signature instead of the rAF effect itself. This avoids re-anchoring elapsed playback time when unrelated timeline-derived arrays change identity, which made high speeds such as 8x appear too slow.
- Added regression coverage that 8x Speed Change advances scene time by 2 seconds over 0.25 seconds and by 7 seconds over 0.875 seconds while inside the marker.

## Verification

- `npm run typecheck`
- `npm test`
