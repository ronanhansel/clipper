# Exclusive Timeline Marker Selection

## Goal

Ensure clicking a timeline marker leaves only that marker family selected. Selecting a composition after a transition should not keep the transition inspector/selection active.

## Changes

- Updated `useTimelineSelectionCommands` so composition, motion marker, and adjustment layer selection clears `selectedTransitionLayerId` and `selectedTransitionLayers`.
- Wired `setSelectedTransitionLayerId` into the shared selection command hook from `App.tsx`, matching the existing transition-selection path that already clears composition, motion, and adjustment selections.

## Architecture Note

- Selection exclusivity belongs in `src/app/features/timeline/useTimelineSelectionCommands.ts` because timeline clicks, compose-open selection, marquee selection, clipboard/context-menu selection, and inspector routing all go through these command boundaries. Keeping the clearing there prevents individual timeline row components from needing one-off selection cleanup.

## Verification

- `rtk npm run typecheck` passes.
