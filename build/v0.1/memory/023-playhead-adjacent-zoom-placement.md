# 023 Playhead Adjacent Zoom Placement

## Context

- User reported that adding a zoom at the playhead on a zoom boundary still errored as overlapping.
- Desired behavior: use the playhead as a preferred location, place the new zoom next to existing zooms when free space remains, and only error when no 1s slot exists.

## Work Log

- Added `defaultZoomDuration` and `minimumZoomDuration` constants.
- Replaced add-zoom overlap rejection with a free-gap placement search around the playhead.
- New zoom markers keep the default 2.2s duration where possible and shrink to the available gap down to the 1s minimum.
- Updated zoom inspector and timeline resize minimum duration to 1s.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.
