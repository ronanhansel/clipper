# 008 Zoom Motion Smoothing

## Context

- User reported that zoom playback was jittery and jumped to a different position before zooming into the focal point.

## Work Log

- Fixed the camera transform math so translation starts at zero when zoom scale is `1` and eases toward the focal point as the scale increases.
- Removed per-frame Web Animations API calls from zoom playback. Playback now applies the timeline-derived transform directly instead of starting a new 450ms animation on every time update.
- Added cubic ease-in/ease-out to the zoom ramp so entering and leaving zoom markers feels smooth instead of linear.
- Added zoom inspector presets for gentle center, hero push, left detail, and close detail setups.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes.
- `npm run typecheck` passes after preset/easing update.
- `npm test` passes after preset/easing update.
- `npm run build` passes after preset/easing update.
