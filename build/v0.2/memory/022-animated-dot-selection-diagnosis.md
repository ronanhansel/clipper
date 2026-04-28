# Animated Dot Selection Diagnosis

## Context

- User reported that nothing can be selected from the Animated Dot Template in the edit pane.

## Finding

- `prt_animated_dot` has no foreground `objects`; its visible dot field and hero dot are stored in `background.elements`.
- Frame selection currently renders/selects/drags only `part.objects` in Edit mode.
- `BackgroundLayerView` uses `pointer-events-none`, and marquee selection calls `createSelectionPayload(finalDragBox, part.objects)`, so background elements are intentionally excluded from hit testing and inspector object selection.

## Implication

- The template appears selectable visually, but there are no selectable foreground objects in that part. Editing those dots currently requires editing `background.elements` through composition/source code rather than the object inspector.
