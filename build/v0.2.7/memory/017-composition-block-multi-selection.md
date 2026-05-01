# Composition Block Multi Selection

## Summary
- Composition timeline blocks now participate in the same marquee timeline selection model as adjustment and motion blocks.
- `selectedParts` tracks composition block selections as an array, while `selectedPartId` remains the primary/inspector selection for existing editor flows.
- Composition selected styling is independent from primary motion-marker selection, so a single marquee can visibly select composition blocks, adjustment blocks, and motion markers together.
- Dragging a selected composition block moves the selected composition group together, including vertical layer previews and final layer drops.
- Delete and context-menu delete now remove selected composition blocks together with other selected timeline nodes.

## Architecture Note
- Composition selection lives in the scoped editor store beside `selectedZoomMarkers`, `selectedTranslationMarkers`, and `selectedAdjustmentLayers`, instead of overloading the single primary `selectedPartId`.
- `TimelinePanel` now includes composition rows in `timelineSelectionFromDrag`, so cross-row marquee behavior is shared across adjustment, motion, and composition blocks.
- `moveCompositionMarkers` batches multi-composition movement in `App.tsx` so marker rebasing happens from one consistent timeline snapshot.
