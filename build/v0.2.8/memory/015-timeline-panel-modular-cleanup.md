# Timeline Panel Modular Cleanup

Extracted safe timeline seams from `src/components/timeline/TimelinePanel.tsx` while leaving Direct timeline pointer transaction and drag-controller closures in place.

Architecture note:
- Shared timeline rendering primitives now live in `src/components/timeline/TimelinePrimitives.tsx`, including layer labels, resize separators, timeline lanes, timeline blocks, composition blocks, and effect drag previews. These preserve existing `data-*` attributes and CSS classes used by drag previews.
- Timeline selection box rendering and imperative DOM updates live in `src/components/timeline/TimelineSelectionBox.tsx` so Direct selection drag logic can keep using the same rAF-ref update path.
- Motion lane rendering and mended-edge label helpers live in `src/components/timeline/MotionLane.tsx`; Direct drag state remains owned by `TimelinePanel.tsx` and only passes callbacks into the lane.
- Compose animation pure model helpers live in `src/components/timeline/composeAnimationModel.ts`; the Compose animation panel itself lives in `src/components/timeline/ComposeAnimationTimelinePanel.tsx`.
- Shared timeline extraction types live in `src/components/timeline/timelineTypes.ts`.
- Second split moved the Direct timeline implementation into `src/components/timeline/DirectTimelinePanel.tsx`, leaving `src/components/timeline/TimelinePanel.tsx` as a small Direct/Compose dispatcher that re-exports `TimelinePanelProps`.
- `TimelinePanelProps` now lives in `src/components/timeline/timelineTypes.ts` so the dispatcher and Direct panel share the contract without importing from each other.
- Pure Direct layer row/layout derivation now lives in `src/components/timeline/directTimelineModel.ts`; it builds adjustment, motion, and composition rows, row heights, starts, layout, and lane sizing while preserving existing row order and fallback layer defaults.

Reuse guidance:
- Add future timeline presentational blocks to `TimelinePrimitives.tsx` when they do not need Direct controller state.
- Keep high-risk Direct drag, resize, auto-scroll, and commit closures in `TimelinePanel.tsx` unless a focused controller can be extracted with tests.
- After the second split, keep high-risk Direct drag, resize, auto-scroll, and commit closures in `DirectTimelinePanel.tsx` unless a focused controller can be extracted with tests.
