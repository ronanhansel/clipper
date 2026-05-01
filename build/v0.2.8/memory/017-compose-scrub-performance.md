# Compose Scrub Performance

## Context

- User reported Compose timeline scrubbing remained laggy and spotty compared with Direct mode.
- The first optimization removed duplicate playhead DOM writes, but did not address the visible screen lag.

## Architecture Note

- Timeline scrubbing is already rAF-throttled in `useTimelineScrubber`, so `usePlaybackController.scrubToSceneTime()` should not add a second rAF before updating the rendered preview time.
- During active timeline scrubs, render-time preview state is updated directly through `setRenderCurrentSceneTime()` while canonical editor/store persistence is deferred until scrub release.
- This keeps the playhead and frame preview in the same rAF turn and avoids repeated Zustand/currentSceneTime store writes during pointer movement.

## Work Log

- Changed active timeline scrubbing in `src/app/features/playback/usePlaybackController.ts` to update render state immediately instead of scheduling a second rAF and store write.
- Preserved final canonical state by committing `setCurrentSceneTime()`, `setRenderCurrentSceneTime()`, and editor state when scrubbing ends or when the final scrub time matches the current ref.
- Kept the previous cleanup where Compose uses `scrubToPlaybackDisplayTime` and active Compose scrubbing skips redundant `syncPlaybackDom()` writes.
- Stabilized `sceneMotionViews` in `useEditorDerivedState()` so the active `part` object is not recreated on every scrub-time render.
- Memoized Compose selected object ids in `App.tsx` to prevent time-only renders from rebuilding Compose selection sets.
- Memoized `ComposeAnimationTimelinePanel` with an active-scrub comparator that ignores `currentTime` changes while the playhead is already being moved imperatively, but still re-renders for real data changes such as part, selection, layers, viewport, or scrub settings.

## Verification

- `npm run typecheck` passes.
