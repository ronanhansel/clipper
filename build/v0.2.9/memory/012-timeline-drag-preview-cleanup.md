# Timeline Drag Preview Cleanup

## Goal

Fix blocked timeline marker drags leaving a red blocked style behind after the drag aborts outside the app/window.

## Implementation Notes

- Timeline drag previews use imperative DOM styling through `src/core/timelineLayers.ts` for rAF-friendly movement and blocked previews.
- `applyTimelineBlockPreview()` temporarily overwrites inline `background` and `color` when `blocked` is true.
- The previous cleanup checked `element.dataset.originalBackground` by truthiness. If the original inline background was empty, cleanup skipped restoration and left the red blocked background inline.
- `applyTimelineBlockPreview()` and `clearTimelineBlockPreview()` now check for saved dataset keys by presence, so empty original styles are restored by removing the inline preview styles.
- The helper also stores/restores original inline color to avoid losing legitimate inline color while still clearing the red blocked preview.
- Single-block composition and transition move previews now compute blocked state against the actual hovered target row. The generic block drag helper passes the target layer into `isBlocked`, and the predicates only check real interval overlap on that layer.

## Verification

- `rtk npm run typecheck` passes.
- `rtk npm run typecheck` passes after target-layer blocking changes.
