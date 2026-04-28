# Effect Nodes And Timeline Interactions

This guide explains how to add new effect nodes while keeping timeline behavior consistent, independent per layer, and performant.

## Current Effect Families

- Composition blocks live in scene `compositions` and render on the `Comp` row.
- Adjustment effects live in scene `adjustmentLayers` and render on the `Adjust` row.
- Motion effects live inside composition markers and render on configurable motion rows.
- Zoom markers live in `zoomMarkers`.
- Pan and rotate markers currently share `translationMarkers`; their effect kind is separated by `TranslationMarker.kind` and their row is separated by `layerId`.

## Add A New Effect Node

1. Add the persisted type in `src/core/types.ts`.
2. Add normalization/defaulting in `src/core/project.ts` if the new data can come from older project files.
3. Add deterministic math in `src/core`, not directly in React. Examples include placement, snapping, active-effect lookup, interpolation, and render/runtime evaluation.
4. Add editor mutation commands in the app/project state layer. Do not mutate project data from timeline components directly.
5. Add creation UI in the tools panel or relevant inspector.
6. Add timeline rendering in `src/components/timeline/TimelinePanel.tsx` or extract a focused lane component if the logic grows.
7. Add preview/export support in the render/camera/runtime path if the effect changes output frames.
8. Add inspector controls for effect-specific fields.
9. Add tests for pure placement, snapping, active-effect, and render math where possible.

## Timeline Independence Rules

- Treat each visible lane as an independent scheduling surface.
- Collision and push constraints must only consider nodes on the same lane/layer unless the feature explicitly links multiple lanes.
- If multiple effect kinds share the same underlying array, always filter by a stable lane key before resizing, moving, snapping, or finding gaps.
- `layerId` is the canonical lane identity for motion effects. Do not infer a target lane only from effect kind once custom rows exist.
- Vacant rows may adopt the kind of the first dropped or moved motion effect, but rows with existing markers must keep their current kind unless the user explicitly changes them.
- Selection state should identify both parent composition/layer and node id. Never rely on node id alone across the timeline.

## Drag And Resize Rules

- Use rAF-throttled transient previews during pointer movement.
- Prefer imperative DOM previews with `transform`, `translate3d`, CSS variables, opacity, width, and height.
- Commit canonical project state once on pointer up/cancel, blur, or another explicit finalization event.
- Do not write project state, persist history, or rebuild expensive derived trees on every pointermove.
- Preserve snapping, clamping, no-overlap, mended-chain, and selection semantics when optimizing previews.
- For vertical cross-layer drags, compute the target row from pointer Y, then preview whole-row `deltaY` and destination row height.
- For horizontal movement, compute constraints against the target layer, not the source layer or the whole effect array.
- For resize, compute push constraints inside the current layer only, then merge changed nodes back into the canonical collection.
- Keep drag-hover suppression scoped to the timeline container. Do not globally disable pointer interactions across the app unless the behavior is intentionally app-wide.

## Snapping Rules

- Scrub snapping and node snapping should use shared timeline boundary helpers where possible.
- Composition boundary guides should be rendered as timeline-wide overlays when dragging nodes across layers, similar to the playhead.
- Snap thresholds should be derived from pixels-per-second so zoom level affects feel consistently.
- Modifier keys such as Shift must update active previews without requiring a new drag.

## Rendering Rules

- Lane blocks should fill the row height unless there is a deliberate nested layout.
- Lane overflow should normally stay hidden.
- During cross-layer drag previews, allow overflow only for the active drag window or render a dedicated overlay.
- Overlays that must span rows, such as playhead and composition boundary guides, should live above the lane grid rather than inside individual lanes.
- Menus and popovers inside clipped timeline rails should render through a portal.

## State Boundaries

- `src/core` owns pure timeline and render calculations.
- `src/components/timeline/TimelinePanel.tsx` owns local pointer/rAF machinery and visual previews.
- App/project state owns canonical mutations such as adding, moving, resizing, deleting, and selecting effect nodes.
- Timeline components should call semantic callbacks such as `onMoveZoomMarker`, `onMoveTranslationMarkers`, or `onUpdateTranslationMarkers` rather than editing project structures directly.
- Keep high-frequency preview state local. Promote state only when other app areas need the canonical result.

## Checklist For New Timeline Interactions

- The node can be selected, multi-selected if appropriate, moved, resized, deleted, copied if supported, and inspected.
- Movement across composition boundaries preserves duration and lands in a valid target composition.
- Movement across layers snaps to full destination rows and commits the correct `layerId`.
- Resize handles do not trigger parent lane selection or block movement through unrelated layers.
- Hover states do not flicker or glow while actively dragging inside the timeline.
- Boundary guides, playhead, selection boxes, and drag previews use consistent z-index layering.
- Empty/vacant layers behave predictably when receiving the first node.
- Typecheck and relevant tests pass.

## Common Failure Modes

- A shared array causes unrelated lanes to block each other during resize or move.
- A lane-local overlay gets clipped and does not span all rows.
- A drag preview changes visually but commits to the source layer because `targetLayerId` was not threaded into the commit path.
- A portal menu is not used inside a clipped rail, so the menu appears not to open.
- Pointermove commits project state repeatedly, causing jank and broken undo history.
