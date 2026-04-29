# Independent Timeline Motion Markers

## Summary
- Timeline motion markers are now treated as scene-level timeline nodes, not composition-owned nodes.
- `TimelinePanel` renders motion rows from top-level `scene.zoomMarkers` and `scene.translationMarkers` through a synthetic motion identity (`__timeline_motion__`) instead of composition IDs.
- Adding, selecting, dragging, resizing, deleting, copying, cutting, and pasting timeline motion markers updates the timeline document motion arrays rather than composition clip marker arrays.

## Architecture Notes
- Composition blocks remain represented by `selectedParts` and clip state.
- Motion marker selections still use the existing `{ partId, markerId }` shape for compatibility, but timeline motion uses the constant `TIMELINE_MOTION_PART_ID` instead of any composition clip ID.
- Project normalization migrates legacy clip-owned motion blocks and clip marker arrays into timeline-level `zoomMarkers` and `translationMarkers`, then clears clip motion fields for timeline clips.
- Preview derivation builds scene motion from scene-level markers and rebases them relative to the active composition only for rendering math; ownership stays at the timeline level.

## Reuse
- New timeline motion behavior should read and write `TimelineDocument.zoomMarkers` / `TimelineDocument.translationMarkers`.
- Do not add new timeline motion behavior to `CompositionClip.zoomMarkers`, `CompositionClip.translationMarkers`, or clip `motionBlocks`; those are legacy/authoring compatibility fields only.
- Use `selectedParts` for composition selection and `selectedZoomMarkers` / `selectedTranslationMarkers` with `TIMELINE_MOTION_PART_ID` for timeline motion selection.
