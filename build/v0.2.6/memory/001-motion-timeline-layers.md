# Motion Timeline Layers

## Status

Implemented the first v0.2.6 motion timeline layer pass.

## Implemented

- Bumped project metadata to `0.2.6` and added `build/v0.2.6/PLAN.md`.
- Added persisted `editorState.timelineLayers` with configurable Comp/Adjust names, motion layer list, and hidden flags.
- Reworked `TimelinePanel` lanes from hard-coded Adjust/Pan/Zoom/Comp rows into configurable Adjust, Motion, and Comp rows.
- Added layer label controls: double-click rename, eye/eye-off visibility toggle, plus on the top motion label, and remove for extra motion layers.
- Made adjustment, pan, zoom, rotate, and comp blocks fill their full 58px lane height.
- Added `TranslationMarker.kind` and `rotation` so rotate markers reuse pan-like timing/drag/resize/selection behavior while rendering as blue motion blocks.
- Added a Rotate effect entry in `ToolsPanel` and a rotation input in `TranslationInspector` for rotate markers.
- Camera preview and Electron export now apply active rotate markers via `rotate(...)` in the camera transform.
- Hidden Comp renders the preview as black; hidden motion layers dim the timeline lane and are ignored by preview camera motion. Hidden Adjust layers are ignored by live preview playback adjustment input and dimmed in the timeline.

## Architecture Notes

- Timeline layer controls should stay in `src/components/timeline/TimelinePanel.tsx` while reusable timeline math remains in `src/core/timeline.ts`.
- Canonical layer names and visibility belong in project/editor state, not local component state, because they affect preview visibility and persistence.
- Motion layer visibility must affect preview camera/effects through core-derived helpers, not by hiding only the timeline UI.
- Rotate should reuse marker timing constraints shared by pan/zoom instead of introducing separate drag logic where possible.
- Rotate currently lives on `translationMarkers` with `kind: "rotate"` to reuse the pan marker infrastructure. Future multiple motion lanes may need a first-class marker collection if per-layer independent scheduling becomes more complex.
- Timeline block height is controlled in `TimelinePanel` by using `absolute inset-y-0` marker blocks inside fixed 58px lanes.
- Revised layer controls so labels show only right-edge eye and ellipsis buttons. The ellipsis opens a local menu for adding a motion layer before/after the current motion layer and removing motion layers.
- New motion layer display names default to `MOTION` regardless of the underlying motion kind.
- Lane category accents are colored borders: Adjust purple, Motion cyan/blue, Comp green. Labels use a right-edge colored border and lane bodies use a left-edge colored border.
- Motion marker drag/drop now only magnet-snaps while Shift is held. The timeline no longer clamps motion moves or new motion effects to empty gaps; committed edits use overwrite semantics instead.
- Marker overwrite behavior is shared in `src/core/timelineOverwrite.ts`: inserted/moved markers trim, remove, or split existing same-layer markers, similar to Premiere/DaVinci overwrite edits. Reuse this for every timeline marker type; marker-specific code should only provide IDs, layer IDs, content, and persistence shape.
- Motion markers that land across composition boundaries are kept as single blocks, matching adjustment block behavior. They are stored on one owning composition with a relative start that may extend outside that composition, while timeline rendering and preview derive scene-absolute timing from the owning composition start.
- Shift snapping is universal across timeline layer types. Motion marker move/resize previews use composition edges, motion marker edges, adjustment marker edges, and the playhead as one shared boundary set.
- Timeline paste anchors the copied selection's earliest marker at the current playhead and preserves each copied marker's original layer ID. Pasted motion markers are no longer clipped to the composition where their pasted start lands; they remain single scene-spanning blocks bounded only by scene duration.
- Tracker target picking resets camera motion effects in the frame preview while picking, so zoom/pan/rotate/perspective layers do not distort hit-testing or the object view. This is a transient preview option in `getLayeredCameraPreviewTransform`, not a project mutation.

## Follow-Up

- Export currently supports rotate markers, but timeline layer visibility is primarily wired into the editor preview. If hidden-layer state should affect media export, thread `editorState.timelineLayers` into the export renderer path and filter comp/motion/adjust there too.
