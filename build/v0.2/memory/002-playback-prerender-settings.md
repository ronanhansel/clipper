# Playback Prerender Settings

## Goal

Add configurable preview prerendering for smoother playback of complex compositions, exposed through a new settings dialog with category navigation.

## Notes

- Started from the existing React DOM preview path in `src/App.tsx`.
- Export already has an Electron offscreen renderer in `electron/main.ts`, but that path reloads a data URL per frame and is intended for final rendering, not realtime preview.
- The first implementation should prefer a lightweight editor preview cache at display resolution and fall back to live React preview when a frame is not ready.

## Implemented

- Added `AppSettings` and `PlaybackPrerenderSettings` in `src/core/types.ts`.
- Added localStorage-backed app settings under `clipper.appSettings.v1` with defaults:
  - prerender enabled
  - 24 fps cache
  - 3 seconds ahead
  - 1 second behind
  - 0.5x preview cache resolution
- Added a project settings dialog in `src/App.tsx` with left-side section navigation and playback prerender controls.
- Added an app bar Settings button plus Cmd/Ctrl+, handling in both the renderer and Electron main process.
- Added an Electron application menu with a Settings item for desktop access.
- Implemented an in-memory preview frame cache that prerenders nearby composition frames with the existing SVG-to-canvas renderer and displays cached bitmap frames during playback when available.

## Status: Incomplete / WIP

- This is explicitly not finished. Treat the current prerender/cache implementation as a prototype that needs follow-up before it can be considered reliable.
- User confirmed the current cache does not appear to improve playback speed in practice. Do not assume the existing implementation is functionally useful for performance.
- The current warmup behavior is wrong for the intended product: it only surrounds the current playhead instead of eagerly caching ahead/across the timeline like DaVinci Resolve's render cache behavior.
- Desired behavior: background caching should continue through timeline ranges until the composition is cached, not just a small local window around the head.
- Desired invalidation model: cached ranges should remain valid until meaningful project/composition changes invalidate the affected ranges. Playback movement alone should not deprecate or discard useful cache coverage.
- Future work should model cache state as persistent timeline range coverage with explicit invalidation, not as a transient playhead-following preview window.
- The timeline cache indicator currently includes an active warm-window marker so users can see that prerendering is attempting work. This is not the same as verified completed cache coverage.
- Actual cached-frame coverage did not visibly appear reliably during manual UI review, so the next pass needs to diagnose whether frame generation is failing, too slow, invalidated too often, or not reflected in timeline state correctly.
- The current implementation uses the renderer's SVG-to-canvas path. A persistent offscreen Electron renderer may still be the better architecture for robust realtime preview caching.
- Before calling this done, separate marker semantics should be clarified: pending/warming frames versus completed cached frames should likely use different visual states.
- Future optimization work may happen first; preserve this WIP state until someone explicitly resumes prerender/proxy playback.

## Verification

- `npm run typecheck` passed.
- `npm test` passed: 2 files, 6 tests.
- `npm run build` passed. Vite still reports the existing large-chunk warning for the app/typescript bundles.
