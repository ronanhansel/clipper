# Hidden Layer Render Order

## Change
- Added shared runtime filtering for timeline layers so hidden composition, adjustment, motion, and transition rows are removed from renderable scenes.
- Changed active composition lookup to resolve overlapping compositions by top-down composition row order, so upper rows take precedence over lower rows.
- Preserved timeline editing visibility by keeping all blocks in the timeline panel while routing preview/export through renderable scene helpers.
- Preserved transition row hidden/lock/order state during project normalization.
- Updated desktop video export rendering to respect explicit clip starts plus hidden background/object state; row-hidden effects are filtered before export is passed to Electron.
- Wired transition visual effects into preview and rendered media export. Active transitions now apply their package visual style to the composited lower-layer camera/frame group rather than only existing as timeline blocks.

## Architecture Note
- Runtime layer semantics live in `src/core/timeline.ts` via `getRenderableScene()`, `getExecutableCompositions()`, `getExecutableTransitionLayers()`, `getExecutableMotionMarkers()`, and `getTopTimelinePartAtTime()` so preview, export, validation, and duration calculations can share one source of truth.
- `src/app/state/editorDerivedState.ts` uses the renderable scene for playback/preview state while `App.tsx` still passes the unfiltered scene to the timeline panel so hidden blocks remain editable.
- `src/app/services/exportService.ts` filters exported/rendered scenes before packaging or sending work to Electron, keeping final output aligned with preview semantics.
- `src/core/transitions.ts` mirrors adjustment visual evaluation for transition effects. `FramePreview` and Electron export consume it so transition rows can affect all lower rendered content.

## Verification
- `rtk npm run typecheck` passes.
- `npm test -- src/core/timeline.test.ts` passes.
- `npm test -- src/core/renderRuntime.test.ts src/core/timeline.test.ts` passes.
