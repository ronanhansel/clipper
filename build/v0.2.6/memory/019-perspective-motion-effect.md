# Perspective Motion Effect

## Context

Pan depth was reverted. Pan is again a 2D X/Y camera translation effect. Full 3D camera controls now live in a separate `Perspective` motion effect.

## Architecture

- Timeline block tags are organized around three lane classes: adjustment, motion, and composition.
- Motion lanes are generic (`kind: "motion"`) and can contain any motion effect block: zoom, pan, rotate, or perspective.
- Legacy motion layer kinds (`pan`, `zoom`, `rotate`) are still accepted during normalization and coerced to generic `motion` lanes so older editor state remains usable.
- Effect identity lives on the block/marker, not the lane. Zoom remains in `zoomMarkers`; pan, rotate, and perspective reuse `translationMarkers` with `marker.kind` distinguishing the effect.
- `Perspective` markers use `marker.perspective` for `{ z, rotateX, rotateY }`. They do not own X/Y pan; use Pan for X/Y motion. The camera distance is fixed internally via `CAMERA_PERSPECTIVE`, not exposed as an effect parameter.
- Camera transform composition is centralized in `src/core/camera.ts` via `formatCameraPreviewTransform()`, producing `translate3d(...) rotateX(...) rotateY(...) rotate(...) scale(...)`.
- The fixed camera distance is applied as the CSS `perspective` property on a dedicated unscaled perspective stage inside `FramePreview`. Keep frame scaling/clipping on the outer frame-content wrapper and keep rotation/Z on the camera child; combining scale and perspective on one wrapper can flatten the projection in Electron/Chromium.
- Inspector edits keep `marker.perspective` and `marker.params.perspective` in sync. Motion-block conversion also promotes `params.perspective` back to marker-level settings so normalization cannot display changed inspector values while the camera evaluates stale top-level values.
- Perspective inspector numeric fields use continuous number scrubbing so Z and Tilt X/Y changes preview in real time while dragging.

## Reuse Notes

- Add future motion effects by adding an effect kind and marker settings, not by adding a new lane kind.
- Timeline gap checks for motion lanes should treat zoom and translation markers as sharing the same lane occupancy.
- Selection overlays remain 2D approximations; a future full 3D selection system should project corners from the camera transform instead of using `boundsToViewport()`.
- Pointer lock failures in number scrubbing are intentionally swallowed because pointer lock is optional in embedded documents.
