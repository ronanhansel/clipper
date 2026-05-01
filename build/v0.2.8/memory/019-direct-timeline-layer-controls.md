# Direct Timeline Layer Controls

Restored Direct timeline layer-row controls after the Compose timeline cleanup removed the visible icon column.

Architecture note:
- `src/components/timeline/TimelinePrimitives.tsx` owns the shared `LayerLabel` presentation again, including the vertical ellipsis, visibility, lock controls, and the portal-backed layer options menu.
- The icon buttons keep the same small size at all row heights. As rows shrink, Direct hides the lock icon first, then the eye icon; the ellipsis remains visible and its menu includes hide/show and lock/unlock actions.
- Direct rows in `src/components/timeline/DirectTimelinePanel.tsx` opt into the controls by passing `onMenuToggle`; Compose animation rows do not pass a menu toggle, so Compose keeps its labels control-free.
- Future Direct per-layer controls should stay in `LayerLabel` so adjustment, motion, and composition rows remain consistent.
