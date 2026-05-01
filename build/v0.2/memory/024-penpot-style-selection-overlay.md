# Penpot-style selection overlay

Implemented a Penpot-inspired selection visual model for the edit page.

- Selection boxes and marquee are rendered as viewport overlays outside the scaled frame/camera layer.
- Overlay geometry remains in frame coordinates and is converted to viewport CSS pixels with `frameScale` at render time.
- Object drag previews still use imperative rAF CSS variables for object transforms, but selector overlay transforms use viewport pixels so the border stays visually 1px during drag.
- Marquee selection now has a Penpot-like minimum drag threshold and optional Space-drag panning of the active marquee rectangle.
- Live marquee selection is updated during drag via the existing rAF scheduler, with a final selection pass on pointer up.
- Selection outlines are offset outward from the object, use blue 1px lines, and expose blue-bordered square corner resize handles.
- The outline thickens when the pointer is within the selector area, not only when hovering directly over the thin edges.
- Side and corner resize handles use anchored resize math; object bounds are previewed imperatively during pointer movement and committed once on release.
- Live marquee selection now also shows the selected object selector immediately while dragging; resize handles are disabled until the marquee finishes.
- Corner handles are kept inside the frame viewport when the selection touches a frame edge to avoid clipped blue handle artifacts.
- Multi-object selections render one selector block per selected object instead of a single union box. Resizing a handle on one block resizes that object and preserves the rest of the selection.
- Resize commit leaves selector positioning styles intact instead of stripping React-owned `left/top/width/height`, preventing the selector handle from snapping to the frame origin after release.

Future notes:
- `SelectionOverlayBox` and `DragSelectionBox` are in `src/App.tsx` near the frame preview components.
- `createSelectionPayload` still uses simple bounds intersection in `src/core/geometry.ts`.
