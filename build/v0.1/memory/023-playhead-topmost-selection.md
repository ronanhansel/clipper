## 023 Playhead Topmost Selection

- Fixed timeline part highlighting by syncing `selectedPartId` to the active timeline part as the playhead moves.
- Timeline part buttons now select on pointer-down as well as click so draggable parts still highlight immediately.
- Added a signpost icon action in the bottom quick action bar. It selects the topmost timeline item under the playhead, preferring an active zoom marker over the current part.
- Replaced the selected part pseudo-element border with the same outline/halo treatment used by zoom markers so the highlight remains visible inside draggable timeline buttons.
- Adjusted the signpost action so it does not move the playhead while selecting; it only selects a zoom marker if the current playhead time intersects that marker's absolute timeline span, otherwise it selects the current part.
- Converted the signpost action into a persistent Fast Select toggle. When enabled, playhead/scrub movement auto-selects the topmost intersected timeline item. Zoom and part timeline halos are now mutually exclusive, and zoom selection no longer gives the containing part a halo.
