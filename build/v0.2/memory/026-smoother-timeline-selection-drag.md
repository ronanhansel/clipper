# Smoother timeline selection drag

Smoothed drag-selection marquee overlays in the Direct timeline Pan and Zoom lanes.

- Replaced per-pointer-move `setZoomSelectionDrag` and `setTranslationSelectionDrag` updates with refs plus rAF-scheduled DOM style writes.
- Added `TimelineSelectionBox` and `updateTimelineSelectionBoxElement` in `src/App.tsx` to move/size the selection rectangle with `translate3d` and width in lane pixels.
- Kept selection drag state only to mount/unmount the overlay and preserve click-vs-drag fallback behavior.
- Live marker selection still updates during drag, but only when the selected marker id set changes and through `startTransition`.

Future notes:
- The relevant code is in `TimelinePanel` around `startZoomSelection`, `continueZoomSelection`, `endZoomSelection`, and their Pan equivalents.
- If very dense marker lanes still feel heavy, split live marker hit-testing to a lower frequency than the visual overlay rAF.
