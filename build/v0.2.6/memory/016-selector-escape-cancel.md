# Selector Escape Cancel

## Goal

Make active tracker or target selector modes cancel immediately when the user presses `Escape`, restoring the editor to its prior non-picking state without applying a selection.

## Notes

- Started from the existing tracker target picker flow in `App.tsx` and `FramePreview.tsx`.
- Added `cancelActiveSelector()` in `App.tsx` as the shared cancellation boundary for zoom focus target picks, translation position target picks, and translation tracker target picks.
- The global keydown handler now intercepts `Escape` before code-editor/input/shortcut exits when a selector is active, prevents further handling, clears picker state, and clears any transient frame-pick preview.

## Architecture

- Cancellation stays in `App.tsx` because the active picker state is split between the editor store (`focusPickZoomMarker`, `positionPickTranslationMarker`, `framePickPreviewPoint`) and App-local tracker picker state (`trackerPickTranslationMarker`).
- `FramePreview` remains responsible only for pointer hover/pick visuals. It does not listen for global keyboard events.
