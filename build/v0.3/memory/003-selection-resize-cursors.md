# Selection Resize Cursors

## Summary
- Restored reliable directional resize cursors for selected object boxes in the frame preview.
- Selection borders now keep their existing visual styling while using larger invisible hit zones for edge and corner resizing.

## Implementation Notes
- `SelectionOverlayBox` in `src/App.tsx` separates visual blue border/handles from pointer hit targets.
- Edge hit zones are 12 px wide/tall and set inline `ns-resize` / `ew-resize` cursors.
- Corner handle hit zones are 18 px while preserving the existing 8 px visible square handles, with inline `nwse-resize` / `nesw-resize` cursors.
- A second pass added frame-level resize hit detection on pointer move and injects a temporary `* { cursor: ... !important; }` style while hovering a resize edge/corner. This avoids object/canvas cursor styles masking the resize cursor.
- The forced cursor is cleared on frame leave, pointer cancel, and `FramePreview` unmount.
- A follow-up strengthened the forced cursor rule to use `html[data-clipper-forced-cursor] body *` and a `--clipper-forced-cursor` CSS variable, because class-level cursor utilities can beat universal selector rules when both are important.

## Verification
- `npm run typecheck`
