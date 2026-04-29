# Padded Composition Timeline

## Summary
- The timeline UI now uses a padded display duration equal to `sceneDuration * 1.5` inside `TimelinePanel`, while the canonical scene duration remains the last composition end.
- Composition blocks, adjustment blocks, motion markers, playhead placement, ruler ticks, selection boxes, drag math, and effect previews render against the padded display duration so users always have extra space to drag clips into.
- Dropping a composition in the padded space commits an explicit `start`; derived scene duration then expands to the new last composition end, and the panel adds a fresh 50% padding region.
- Scene duration is derived from the maximum timeline composition end (`sceneDuration` / `timelineDuration`), not the last item in array order. This keeps the playhead and export length tied to actual video end when compositions overlap or are reordered by layer.
- `timelineDisplayDuration(duration)` is the shared padded-canvas scale helper. Both `TimelinePanel` and `App.syncPlaybackDom` must use it for playhead percentages; using raw `sceneDuration` against the padded canvas makes the playhead jump to the padding end.
- The padding is now user-tunable through Settings > Timeline > End padding. The persisted editor-state field is `timelineEndPaddingFraction`, with `defaultTimelineEndPaddingFraction = 0.5` preserving the original `sceneDuration * 1.5` canvas.

## Gap Behavior
- `getTimelinePartAtTime` now returns `null` when no composition covers the current time instead of falling back to the first or last composition.
- In composition mode, derived editor state uses the empty black composition for those gaps, making explicit holes between compositions preview as black.
- `moveCompositionMarker` and `updateCompositionMarker` freeze all current composition timeline starts before committing a move/resize, so later implicit compositions do not auto-reflow when one block is moved down/right.
- `rebaseCompositionTimelineMarkers` keeps nested motion markers at their absolute timeline positions when a composition start changes. This makes composition blocks and motion markers behave as equal independent timeline items; layer order/rendering decides the final output rather than timeline items pushing each other around.
- Top-level timeline hit-testing now returns only `adjustment`, `motion`, or `part`; zoom/pan/rotate/perspective remain effect subtypes behind `motionKind` for dispatch. DOM timeline blocks likewise use `data-timeline-marker-kind="motion"` with `data-timeline-motion-kind` only as an adapter for legacy handlers.

## Reuse Notes
- Keep export/render duration tied to `sceneDurationSeconds`, not `timelineDisplayDuration`; the padding is UI-only.
- Use `timelineDisplayDuration(sceneDuration, timelineEndPaddingFraction)` for timeline pixel-to-time math whenever the DOM width is the padded timeline canvas.
- Composition, adjustment, and motion drop/move previews clamp their start to the visible padded timeline end, not `timelineDisplayDuration - duration`. This lets long nodes be placed at the current content end without forcing overlap; the committed node may overflow the current canvas and then expands the canonical scene duration.
- Right-edge resize for adjustment and motion blocks is not capped to the current padded canvas. Keep minimum-duration and left-edge constraints, but let the end extend past the visible duration so the next derived scene duration can grow.
- Padded durations can be fractional, e.g. `25.5s`, while ruler labels use whole-second `formatTime`. `TimeRuler` filters adjacent labels with the same rendered text so the end label does not duplicate the previous major tick (`00:25 00:25`), while tick marks remain unchanged.
- Timeline block drag/resize interactions now share scrub-style edge auto-scroll. The drag math adds `viewport.scrollLeft - initialScrollLeft` to the pointer delta so stationary edge-hover scrolling continues moving the node in timeline time instead of only moving the viewport.
