# Scrub Performance

## Context

- User reported lag while scrubbing through the timeline.
- Initial review found scrub pointer moves were writing top-level `currentSceneTime` on every pointer event, causing broad app renders and repeated magnetic snap boundary work.

## Work Log

- Batched scrub updates through `requestAnimationFrame` so high-frequency pointer events commit at most one React time update per frame.
- Cached scrub snap boundaries with `useMemo` in `TimelinePanel` and changed magnetic snap lookup to use the cached sorted boundary list.
- Memoized timeline ticks and selected marker key sets used by timeline rendering.
- Avoided redundant Shift-snap state updates during scrub pointer moves.
- Guarded fast-select effect updates so it only writes selection state when the selected item actually changes.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.
