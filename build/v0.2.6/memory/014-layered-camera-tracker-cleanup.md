# Layered Camera Tracker Cleanup

## Notes

- Fixed stale camera tracking after removing a pan layer or clearing a pan tracker id.
- The bug was caused by preview camera evaluation reading all composition pan/zoom/rotate markers directly, which allowed markers from removed motion layers to keep affecting the camera.

## Architecture

- Camera-layer membership remains owned by `src/core/camera.ts` through `getLayeredCameraPreviewTransform` and `isMarkerOnMotionLayer`.
- Editor-derived preview state and live `FramePreview` playback should use the layered camera helper whenever timeline mode is `composition`, so removed or hidden motion layers are ignored consistently.
- Keep tracker id behavior inside camera marker resolution; UI actions only mutate `TranslationMarker.followId` or marker/layer membership.

## Verification

- `npm test -- --run src/core/camera.test.ts`
- `npm run typecheck`
