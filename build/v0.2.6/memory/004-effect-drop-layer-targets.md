# Effect Drop Layer Targets

## Status

Fixed effect drag-and-drop from the effects pane onto timeline layer labels.

## Notes

- `ToolsPanel` starts effect drags with `application/x-clipper-effect` payloads such as `adjust:frameSkip`, `motion:pan`, `motion:zoom`, and `motion:rotate`.
- `TimelinePanel` accepted these drops only on the scrollable lane body. The left layer labels looked like the layer target but had no drag/drop handlers.

## Implemented

- `LayerLabel` now accepts optional drag-over/drop handlers and wires them to the label row container.
- The Adjust label accepts Frame Skip drops and creates the adjustment at the current playhead time.
- Motion labels accept matching motion effect drops; empty motion labels accept any motion effect and assign their layer kind through the existing `addMotionEffect` path.
- Timeline lane-body drops still use the pointer's horizontal position to choose scene time.
- Added transient effect drag previews in `TimelinePanel`: hovering a compatible layer displays a ghost node using the same placement logic as the eventual drop.
- Effect drag payloads now also include `text/plain` as a fallback so drag/drop still works if the platform strips or ignores the custom MIME type.
- Reworked effect hover preview into a transient, unregistered timeline block. The preview is created as soon as a compatible lane is hovered, then moved with the same gap, boundary, and optional shift-snap constraints used by real motion marker moves.
- The native browser drag ghost is hidden once dragging starts from `ToolsPanel`, so the dim timeline preview becomes the visible drag response.
- Drops now commit using the preview block start rather than raw pointer time, keeping the final inserted effect aligned with what the user saw while hovering.
- Smoothed effect preview movement by keeping React state limited to preview mount/unmount and updating the preview block position/size imperatively with `requestAnimationFrame`, matching the normal timeline block drag pattern more closely.
- Boundary separator guides now display while an effect preview is active, not only while dragging existing motion markers.
- Fixed pan/rotate drops onto generic/vacant motion rows. Timeline hover/drop now derives the dragged motion kind first, then allows the row if it is empty, already the same kind, or currently vacant. `App.addMotionEffect` mirrors this rule and retags vacant layers to the committed effect kind before inserting the marker.

## Verification

- Ran `npm run typecheck` successfully.
