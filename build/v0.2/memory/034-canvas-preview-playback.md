# Canvas Preview Playback

## Context

- User wants preview playback closer to Framer/Rive performance, where playback avoids live editable DOM/SVG work.
- Existing v0.2 playback prerender path rasterizes HTML/SVG into WebP object URLs and overlays an `<img>` above the editable frame while playing.

## Work Log

- Started a pass to make cached playback display canvas-backed and reduce continuous React updates during playback.
- Changed `PreviewFrameCacheEntry` from WebP object URLs to `ImageBitmap` objects created from the prerender canvas.
- Replaced cached playback `<img>` swapping with `PrerenderedFrameCanvas`, which draws the active bitmap into one canvas.
- When a cached frame is available, `FramePreview` no longer mounts the editable camera DOM tree, avoiding hidden DOM/React preview work during playback.
- Cached playback now advances `currentSceneTime` React state only when the prerender frame index changes, while `currentSceneTimeRef` still tracks continuous time internally.
- Cache eviction and invalidation now call `ImageBitmap.close()` instead of revoking object URLs.
- Follow-up: `FramePreview` now stays canvas-only for the entire active composition playback session when prerender playback is enabled, even on cache misses. This prevents fallback remounts of the full editable DOM during playback.
- Follow-up: broadened active playback to canvas-only for any interactive playback with prerender enabled, not just composition timeline mode.
- Follow-up: cache warm-up/rasterization now stops while playing and any in-flight render window is invalidated on play start, preventing SVG/HTML-to-canvas work from competing with playback.
- Follow-up: active playback uses the nearest cached `ImageBitmap` when the exact frame is missing, keeping the preview canvas populated without remounting the DOM.
- Reversal: user reported no visible improvement and requested removal of all caching features.
- Removed preview prerender/cache state, refs, effects, `ImageBitmap` cache entries, canvas cache display, timeline cache markers, playback prerender settings UI, settings persistence, and SVG/HTML-to-canvas preview cache helpers.
- Playback is back to the live DOM preview path only.
- Reversal: user requested restoring the simpler full DOM preview without caching so a later migration can start from a clean baseline. Removed the no-cache playback SVG image renderer and restored `FramePreview` to always render the live DOM path.

## Verification

- `npm run typecheck` passes.
- `npm run build` passes. Vite still reports the existing large chunk warning for bundled app/editor dependencies.
- Follow-up `npm run typecheck` passes after forcing active playback to stay canvas-only.
- Follow-up `npm run typecheck` passes after pausing cache generation during playback.
- `npm run typecheck` passes after removing preview caching features.
- `npm run typecheck` passes after restoring the full DOM preview path.
