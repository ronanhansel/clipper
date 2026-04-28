## Timeline Layer Menu Positioning

Updated `src/components/timeline/TimelinePanel.tsx` so motion layer option menus are positioned with fixed viewport coordinates instead of absolute positioning inside the timeline rail. This avoids clipping by the timeline's scroll/overflow containers and clamps the menu to the visible window borders.

The `LayerLabel` component owns this behavior because it already owns the layer option trigger and menu actions. Reuse this local fixed-position pattern for small timeline rail menus that must escape the timeline viewport; use the shared `AppContextMenu` for right-click context menus.

Layer labels now show edit affordance on hover with a text cursor and a thin caret-style accent while preserving the existing double-click rename flow. Editable layer names use normal-case text so custom names display as typed instead of being forced uppercase.

Layer option menus close on outside pointer down by default. The menu ignores clicks inside itself and on its trigger, then delegates to the existing layer menu toggle so only the owning layer label updates its open state.

Global range slider styling in `src/styles.css` sets pointer cursors on range inputs, WebKit slider tracks/thumbs, and Firefox tracks/thumbs so slider controls advertise click/drag affordance consistently.

Motion layer menu copy now uses spatial wording: "Add motion above" and "Add motion below". New motion layers default to a persisted `empty` layer kind, rendered by `EmptyMotionLane`, so they do not duplicate existing pan/zoom/rotate marker lanes. Layer rename/add/remove operations route through history-backed editor state updates with history coalescing disabled for those operations, making each operation undoable and redoable; hide/show stays non-history by passing `{ history: false }` from `TimelinePanel`.

`TimelinePanel` now accepts `timelineName` and renders it in the left header cell above the layer labels, using the active timeline document name from `App.tsx` with a scene-name fallback.

Timeline rows support saved `editorState.timelineLayers.rowHeights`. Separators render as the single visible horizontal row boundary across both the label rail and timeline canvas. Internal separators are owned by the row below them, so dragging a layer's top border resizes that layer; dragging down shrinks it and dragging up expands it. Resizes preview row height before committing a history-backed project-state update. Lane containers and blocks use explicit `h-full min-h-0` sizing so clips, adjustment blocks, and motion markers fit exactly within their row after resizing.

Tool effects are now drag sources (`application/x-clipper-effect`). Adjustment drops are accepted only by the Adjust lane. Motion drops are accepted only by matching motion lanes (`motion:zoom` on zoom, `motion:pan` on pan, `motion:rotate` on rotate); invalid drops are ignored silently. Dropped markers persist their `layerId`, and same-kind marker drags across rows update `layerId` when dropped on a matching layer.

Empty motion layers accept any motion effect drop. On drop, the layer is converted from `empty` to the dropped effect kind and the newly created marker is assigned to that layer. Existing typed motion layers still only accept effects/markers of the same kind.
