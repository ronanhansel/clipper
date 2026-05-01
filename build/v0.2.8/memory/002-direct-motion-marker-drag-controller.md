# Direct Motion Marker Drag Controller

`src/components/timeline/TimelinePanel.tsx` now routes Direct zoom and translation marker pointer updates through one local `updateMotionMarkerFromPointer` helper.

The shared path owns selection guards, pointer transaction setup, scroll-adjusted move timing via `getTimelineDragDeltaSeconds`, layer drop previews, block delta snapping, resize snapping, mended-edge suppression, preview map updates, transform previews, and commit/cancel cleanup. Marker-specific wrappers only provide the motion kind, selected drag/resize builders, layer lookup, lock and mended-edge checks, absolute resize source builders, and move/resize commit callbacks.

Architecture note: the controller remains local to `TimelinePanel.tsx` because it closes over timeline viewport refs, snap guide callbacks, selection state, and commit props. If another timeline surface needs identical marker dragging, extract this helper into a focused timeline interaction module with those dependencies passed explicitly.
