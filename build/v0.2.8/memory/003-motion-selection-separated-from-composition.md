# Motion Selection Separated From Composition

## Summary
- Selecting a motion marker no longer visually selects its parent composition block in the timeline.
- Composition block selection is now driven only by explicit `selectedParts`, not by `selectedPartId`.

## Architecture Notes
- `selectedPartId` can still be used as contextual state for inspector/marker ownership.
- `selectedParts` is the canonical timeline composition selection model and should be used for block highlighting and multi-composition operations.
- Keep motion marker selection in `selectedZoomMarkers` and `selectedTranslationMarkers`; do not infer composition selection from marker ownership.

## Reuse
- Future timeline UI should distinguish contextual parent IDs from selected timeline nodes.
- Use `selectedParts` when deciding whether a composition block itself is selected.
