# Direct Timeline Timing Unification

## Goal

Unify Direct composition and adjustment block move/resize timing with Compose timing helpers so drag delta, snapping, minimum duration, and clamping behavior are controlled from `src/core/timelineBlockTiming.ts`.

## Architecture Note

- Scene-level Direct blocks can intentionally extend the scene by moving/resizing into the padded timeline area, while Compose animation blocks are contained within the active composition duration.
- Keep that difference as explicit shared-helper bounds options instead of handwritten Direct-only timing math in `TimelinePanel`.

## Implementation

- Added focused coverage in `src/core/timelineBlockTiming.test.ts` for scroll-adjusted drag deltas, move containment, Direct-style start-only move bounds, minimum-duration resize clamps, Direct-style unbounded end resize, and start/end snap guide reporting.
- Extended `getTimelineBlockTiming()` with `moveMinStart`, `moveMaxStartMode`, and `endMaxMode` so Compose keeps contained timing by default while Direct composition/adjustment blocks can use explicit scene-extension behavior.
- Refactored Direct composition and adjustment block pointer handlers in `TimelinePanel` to derive deltas from `getTimelineDragDeltaSeconds()` and move/resize timing from `getTimelineBlockTiming()` while retaining preview map keys, multi-selection commits, target layer row previews, snap guides, and commit callbacks.

## Verification

- `npm run typecheck` passes.
- `npm test` passes with 91 tests.
