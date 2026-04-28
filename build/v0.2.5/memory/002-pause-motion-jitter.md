# Pause Motion Jitter

## Context
- Investigating a small jitter that appears when pausing playback while camera pan-follow, zoom, or object motion effects are active.
- Goal is to settle the preview on the exact paused frame without a final one-frame drift from live playback interpolation.

## Notes
- Created at start of work per project agent instructions.

## Implementation
- `src/App.tsx`: pausing through `togglePlayback` now copies the live `currentSceneTimeRef` into both the editor-store playhead and rendered `currentSceneTime` state before clearing playback. This prevents the preview from rendering one paused frame using the stale, last React-synced playhead time.
- `src/components/preview/FramePreview.tsx`: the local live preview time now settles back to `previewTime` in `useLayoutEffect`, so the fallback happens before paint instead of after a visible frame.

## Architecture Note
- The fix stays at the playback/preview boundary instead of changing camera, zoom marker, or object motion evaluation. `App.tsx` owns canonical playhead settling; `FramePreview` owns its transient rAF preview time and must synchronize that transient cache before paint when live playback stops.
