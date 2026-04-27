# 009 No Implicit Object Selection

## Context

- User reported that pressing play initially showed the blue object selector box even though they were not selecting anything.

## Work Log

- Removed the default selected object on app startup in `src/App.tsx`.
- Stopped playback-driven part changes and timeline part selection from automatically selecting the first object in the part.
- Explicit object clicks, object drags, and drawn selection boxes still set object selection.
- Added pre-animation hidden states for `inspector-card` and `selector-box-demo` so their blue/dashed demo boxes do not flash before their intended entrance timing during playback.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.
