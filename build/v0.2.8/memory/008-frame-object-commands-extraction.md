# Frame Object Commands Extraction

Extracted compose/frame object mutation commands from `src/App.tsx` into `src/app/features/frame-interactions/useFrameObjectCommands.ts`.

## Architecture Notes

- `useFrameObjectCommands` owns direct composition object mutations, compose layer selection, object reordering, selected part duration updates, part frame updates, and background updates.
- Chart bounds synchronization remains centralized through `syncChartObjectBounds` inside `updateObjectById`, so inspector/text edits that change object bounds continue to keep `chart.bounds` aligned with the object bounds.
- Compose layer selection semantics are preserved in the hook: selecting objects switches the right panel to video, clears text editing, clears part/marker/adjustment selections, sets the first object as the primary selected object, and rebuilds the multi-object `SelectionPayload` from canonical frame objects.
- `App.tsx` now consumes the returned command callbacks and remains responsible for higher-level orchestration, derived state, and wiring UI panels/controllers.

## Reuse Guidance

- Add future compose object mutations to `useFrameObjectCommands` instead of reintroducing local helpers in `App.tsx`.
- Keep pointer-move drag/resize preview machinery in `useFrameInteractionController`; use this hook for committed object/project mutations and selection commands.
