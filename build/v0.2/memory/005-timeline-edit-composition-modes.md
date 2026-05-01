# Timeline Edit And Composition Modes

## Context

- User wants the timeline split into two modes: Edit and Composition.
- Edit mode should show only parts for now, with no Pan or Zoom lanes.
- Composition mode should show Pan, Zoom, and Parts lanes.
- Scene element selection should be unavailable in Composition mode so composition can focus on motion work.

## Work Log

- Added separate `timelineMode` state independent of the existing Interactive/Code editor mode.
- Added an Edit/Composition segmented control in the timeline header.
- Edit mode hides Pan and Zoom timeline lanes and clears marker selection.
- Composition mode shows Pan, Zoom, and Parts lanes, hides frame object selection state, and disables object pointer selection/dragging on the scene.
- Tools panel only exposes zoom/pan marker actions while in Composition mode.
- Edit mode also disables camera zoom and pan effects in the frame preview so users can select and add elements against the untransformed frame.
- Timeline mode now persists as `editorState.timelineMode` so Edit/Composition reopens in the last saved view.
- Scrubbing and empty motion-lane clicks no longer clear the current selection, reducing accidental "Nothing selected" inspector states.
- Expanded the sample animated dot background field to `x: -1100, y: -600, width: 4200, height: 2280` so current camera pans do not reveal the frame fallback color.
- Background layer color now fills the union of the frame and background element bounds, so oversized background elements carry their layer color through camera pans.
- Made background overscan fill configurable with `background.stretchToElements` and a "Stretch BG" checkbox in the part inspector. The animated dot sample enables it.
- `Stretch BG` now controls the whole background layer overscan: disabled clips both layer color and background elements to the frame; enabled lets both extend beyond the frame.
- Simplified the Stretch BG inspector control into a full-row clickable toggle without explanatory text and with pointer cursor over the whole row.
- Decoupled timeline scrubbing from selection: background/empty-lane scrubs no longer auto-select the item under the playhead unless Snap selector is enabled, and selecting a part no longer jumps the scrubber to the part start.

## Verification

- `npm run typecheck` passes after Stretch BG control polish.
