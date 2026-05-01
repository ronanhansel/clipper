# Effect Drag Ghost

## Status

Updated effect drags from the tools panel so a visible drag ghost appears immediately on drag start.

## Implemented

- Replaced the previous transparent `setDragImage` placeholder in `src/components/ToolsPanel.tsx` with a small themed drag image using the effect label and family accent.
- Kept the existing timeline hover preview/drop behavior in `TimelinePanel` unchanged; the native ghost now covers the pre-timeline portion of the drag.
- Documented the drag label/accent requirement in `docs/EFFECT_NODES_AND_TIMELINE_INTERACTIONS.md` so future draggable effects reproduce the immediate native ghost behavior.
- Reworked the source ghost into a controllable DOM element over a transparent native drag image. `TimelinePanel` dispatches `clipper:effect-drag-preview` when effect preview nodes mount/unmount so `ToolsPanel` can hide the source ghost while timeline nodes are visible.
- External effect timeline previews now recompute from the current cursor scene time on each `dragover`, then apply snapping/constraints, instead of preserving the first timeline-enter offset.
- Source ghost cleanup now listens to global `drop`, `pointerup`, and `mouseup` in addition to `dragend`, with an idempotent fallback timeout, so no-op drops outside timeline targets do not leave the custom ghost stuck onscreen.
- The tools panel is also an explicit no-op drop target for Clipper effect drags. Dropping an effect back onto the source panel now calls the active ghost cleanup directly instead of waiting for delayed browser `dragend` cleanup.
- Return-to-source cleanup runs inside the global drag listener via `document.elementFromPoint(clientX, clientY)`, so cleanup does not depend on React drag events firing on the source panel during native drag. It uses a short pickup grace period and movement threshold instead of drag-leave state, avoiding immediate pickup deletion while clearing the ghost as soon as the cursor is back over the effects pane.
- The source ghost now hides only while `clipper:effect-drag-preview` is active. With pointer-driven release cleanup in place, dragging from a valid timeline row back out of the timeline makes the source ghost reappear under the cursor without reintroducing native `dragend` linger.
- Cleanup also listens on `document`-level `pointerup`/`mouseup` capture in addition to window listeners to clear the ghost as soon as release events are observable.
- Replaced native HTML effect button drags with pointer-driven custom drags. `ToolsPanel` now emits `clipper:effect-pointer-drag` move/drop/cancel events, owns a DOM source ghost, and removes it synchronously on pointer release. `TimelinePanel` consumes that event to run effect preview/drop placement without depending on delayed browser `dragend` state.
- Pointer-driven effect drags now set `timelineDragActive` while the pointer is over the full timeline footer, not just the scroll viewport, so `.clipper-timeline-dragging-no-hover` suppresses top separators/borders and other timeline hover states during external effect drags.

## Architecture Notes

- The immediate ghost belongs to `ToolsPanel` because it is drag-source UI state, while lane placement remains owned by `TimelinePanel` through its existing effect drag preview helpers. Cross-component coordination uses `clipper:effect-pointer-drag` for pointer-driven moves/drops and `clipper:effect-drag-preview` for preview visibility.
- Future effect buttons should add labels/accent entries in `ToolsPanel` if they need custom source ghost text.
