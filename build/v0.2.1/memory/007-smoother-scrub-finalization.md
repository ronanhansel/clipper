# Smoother Scrub Finalization

## Context

- User wants timeline scrub interaction to feel smooth and instant.
- Existing scrub work already moves the playhead imperatively with rAF and CSS transforms, but accepted scrub ticks still wrote editor state during active drags.

## Architecture Note

- `TimelinePanel` in `src/App.tsx` continues to own transient scrub input, rAF preview movement, throttled scrub commits, and pointer-release finalization.
- App-level `currentSceneTime` remains the narrow React signal used for preview/editor time, while `editorState.currentSceneTime` persistence is skipped during active pointer scrubbing and finalized after the scrub ends.
- Future scrub work should preserve the split between transient interaction state and persisted editor state; do not reintroduce project/editor-state writes on every active pointer scrub tick.

## Implemented

- Split `currentSceneTime` editor-state persistence out from the broader editor-state effect.
- Guarded `currentSceneTime` persistence while `timelineScrubbingRef` is active.
- Guarded scrub rAF commits so active scrub ticks do not write persisted editor state.
- Moved pointer-release finalization ahead of the final immediate scrub commit so the final time is persisted once after scrubbing ends.

## Verification

- `npm run typecheck` passes.
