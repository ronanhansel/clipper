# Timeline Composition Clipboard

## Goal

Fix timeline copy/paste so composition clips can be copied and pasted like other timeline nodes.

## Implementation Notes

- `useTimelineClipboardCommands` owns timeline clipboard state for keyboard shortcuts and context menus.
- Composition clips need to be a first-class clipboard kind instead of falling through to adjustment, transition, or motion selections.
- Composition paste placement should use the same non-overlap rule as timeline drag/drop: if the requested paste start collides on the target composition layer, paste at the next available start on that layer.

## Changes

- Added a `composition` clipboard variant that captures selected timeline parts before other timeline node selections, so copying a selected composition no longer accidentally copies an adjustment, transition, or motion marker.
- Right-click copy on a composition now captures that composition even when it was not already selected.
- Composition paste duplicates the full timeline clip with a new clip id and preserves `compositionId`, duration, frame/background/object data, source metadata, motion markers, and layer assignment.
- Composition paste uses the clicked composition lane for context-menu paste and the copied layers for keyboard paste.
- If the requested paste start overlaps an existing clip on the destination layer, the whole pasted composition group shifts to the next free space while preserving relative offsets.
- `TimelineBlankContextTarget` and `TimelineNodeContextTarget` now carry `compositionLayerId` so context-menu paste can target the exact lane the user clicked.
- Transition paste now respects the same `blocksOverlap` rule used by transition drag/drop. Clipboard-pasted transitions that would overlap an existing transition on the same transition row shift forward as a group to the next free space.

## Verification

- `rtk npm run typecheck` passes.
- `rtk npm run typecheck` passes after adding transition paste blocking.
