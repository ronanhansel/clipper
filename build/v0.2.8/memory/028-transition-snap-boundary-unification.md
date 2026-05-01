# 028 — Transition Snap Boundary Unification

## Summary

Fixed the scrub playhead not snapping to transition marker boundaries (start, end, and midPoint) by unifying transition handling inside the shared snap boundary generation system. Removed redundant manual transition edge patching in `getUniversalBlockSnapBoundaries` and closed the gap in `getUniversalTimelineSnapBoundaries` where transitions were previously omitted.

## Changes

### `src/core/timeline.ts`
- Updated `getScrubSnapBoundaries` to accept an optional third parameter:
  ```ts
  transitionLayers: Array<Pick<TransitionLayer, "start" | "duration" | "midPoint">> = []
  ```
- Added transition edges to the returned boundaries:
  ```ts
  ...transitionLayers.flatMap((layer) => [
    layer.start,
    layer.start + layer.duration,
    layer.start + layer.midPoint,
  ])
  ```
- `TransitionLayer` was already imported in this file.

### `src/components/timeline/DirectTimelinePanel.tsx`
1. **`scrubSnapBoundaries` (line 75)**  
   Now passes `transitionLayers` to `getScrubSnapBoundaries` and includes `transitionLayers` in the `useMemo` dependency array.

2. **`getUniversalBlockSnapBoundaries` (lines 704-712)**  
   Simplified by delegating to the updated `getScrubSnapBoundaries`. Removed the redundant manual `transitionEdges` patch:
   ```ts
   const snapTransitions = transitionLayers.filter((item) => !options.excludeTransitionIds?.has(item.id));
   return withPlayheadSnapBoundary(getScrubSnapBoundaries(snapTimeline, snapAdjustments, snapTransitions));
   ```

3. **`getUniversalTimelineSnapBoundaries` (lines 591-598)**  
   Now passes `transitionLayers` to `getScrubSnapBoundaries` so motion-marker drag snap boundaries also include transition edges.

## Architecture Notes

- `getScrubSnapBoundaries` in `src/core/timeline.ts` is the single canonical source for scrub and block snap boundaries. It now handles three layer types: timeline parts (with motion markers), adjustment layers, and transition layers.
- `getUniversalBlockSnapBoundaries` and `getUniversalTimelineSnapBoundaries` both consume the same helper, eliminating divergence.
- `getMarkerSnapBoundaries` and `getTimelineMarkerDragSnapBoundaries` were intentionally left untouched — they are motion-marker-specific and scoped to marker-to-marker snapping.

## Verification
- `npx tsc --noEmit` — clean
- `npx vitest run` — 102/102 tests pass

## Risks / Follow-up
- None. The change is additive (new optional parameter) and the removed manual patching was functionally identical to what `getScrubSnapBoundaries` now produces.
