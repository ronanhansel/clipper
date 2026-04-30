## Unified Marker Movement

Investigated and aligned motion marker bulk move/resize behavior with adjustment-layer marker behavior.

## Divergences Found

- Adjustment resize always resolves selected unlocked layers through `selectedAdjustmentResizeTargets()` and applies the same resize timing to every target.
- Motion resize had a separate branch that collapsed resize targets to only the active marker whenever the selected/mended drag group had more than one item, so bulk resize did not behave like adjustment layers.
- Motion move used handwritten block snap/clamp math inside `blockDeltaForTimelineDrag()`, while composition and adjustment moves use `getTimelineBlockTiming()` from `src/core/timelineBlockTiming.ts`.
- Motion move did not fall back to the source layer when the pointer was not over a valid motion layer; adjustment move does.

## Implementation

- `src/components/timeline/DirectTimelinePanel.tsx` now derives motion move block deltas through `getTimelineBlockTiming()` with the same Direct-style bounds used by adjustment/composition blocks.
- Motion resize now always uses `selectedMotionResizeTargets(part, marker)`, matching adjustment resize target resolution while still relying on `resizeTimelineMarkersWithPush()` for mended marker chains.
- Motion move target layer resolution now falls back to the source motion layer, matching adjustment move commit behavior.

## Architecture Note

Marker movement still lives in `DirectTimelinePanel` because it owns viewport refs, snap guides, row drop previews, selected marker state, and commit callbacks. Shared timing belongs in `src/core/timelineBlockTiming.ts`; mended marker resize remains in `src/core/timeline.ts` via `resizeTimelineMarkersWithPush()`.

## Verification

- `npm run typecheck` passes.
- `npm test -- src/core/timeline.test.ts src/core/timelineBlockTiming.test.ts` passes with 40 tests.
