# Static Playback Clock

## Context

- User reported playback stutter even on the blank black pause composition.
- The blank pause has no objects, background elements, or composition markers, so the stutter was caused by editor playback clock work rather than visible content rendering.

## Work Log

- Playback now advances `currentSceneTimeRef` continuously and updates the visible time label plus timeline playhead imperatively each animation frame.
- Static compositions skip full React state updates on every playback frame; React syncs at composition boundaries and on pause/end.
- Time-sensitive compositions still sync React every frame so object templates, motion, animated graph elements, and composition camera markers continue to animate correctly.
- Pause/step/jump controls now use the live playback ref so controls land on the actual playback position even when React state was intentionally throttled.
- Playback time is computed from wall-clock elapsed time (`performance.now()` minus playback start) instead of accumulating frame deltas, so dropped frames do not slow the timer or playhead.
- Timeline auto-follow is disabled while playback is running, preventing the viewport from snapping back when the user scrolls away from the right edge during playback.
- Follow-up optimization: app-level playback no longer syncs React every frame for time-sensitive parts. It only updates the authoritative clock/timer/playhead and commits React time at part boundaries/end/pause.
- Time-sensitive preview rendering moved into `FramePreview` with local rAF state. Animated objects, templates, backgrounds, and composition camera markers update inside the preview subtree instead of rerendering the full editor shell/timeline/inspector.
- Follow-up fix: Space pause now reads the current playing state through `isPlayingRef`, avoiding stale keydown closures after playback starts.
- Follow-up fix: timeline playhead position is now a CSS variable (`--clipper-playhead-left`) updated by the live playback clock. React boundary renders keep a stable `left: var(...)` style, preventing boundary commits from briefly snapping the playhead backward.
- Follow-up scrub optimization: pointer scrubbing now updates `--clipper-playhead-left` immediately for smooth cursor-following, while `onScrub` state commits are throttled by the Timeline setting and finalized immediately on pointer release/cancel.
- Follow-up setting: scrub commit throttle is editable in Settings > Timeline and now defaults to 75 ms.
- App bar action buttons (`Settings`, `Export`, `Save`) now share a fixed 70 px width for consistent alignment.
- Follow-up scrub smoothing: scrub pointer events are now coalesced into a single rAF preview. Pointermove only records the latest clientX/snap state; rAF computes the playhead preview and the throttled commit path handles React updates and optional snap selection.
- Follow-up scrub smoothing: scrub preview now moves the playhead with `translate3d(var(--clipper-playhead-x), 0, 0)` instead of mutating `left`, matching the compositor-friendly drag pattern used elsewhere. While scrubbing, app-level current-time sync is suppressed so throttled React commits cannot reset the transient playhead position mid-drag.
- User confirmed the transform-based scrub preview feels better. Future timeline scrub work should preserve this pattern: pointer events only capture latest input, rAF owns transient playhead movement, React commits remain throttled/finalized separately, and app-level time sync must not overwrite the transient playhead while scrubbing.
- Follow-up playhead polish: playhead line heights now span the full edit/direct timeline lane stack (`82px` edit, `198px` direct). Playback rAF no longer depends on active part id, preventing boundary state commits from restarting the wall-clock loop and causing visible back/forth jumps before composition switches.
- Follow-up playback authority fix: scrubbing/clicking the timeline while playback is running resets the live `playbackClockRef` and `playbackClock` state to the committed user time, so playback continues from the user-selected position instead of snapping back to the old wall-clock baseline.
- Follow-up authority fix: `scrubToSceneTime` now updates `currentSceneTimeRef` and the live playback clock synchronously before scheduling the React state commit. This prevents playback from advancing a frame from the old wall-clock baseline after the user clicks/scrubs backward while playing.

## Verification

- `npm run typecheck` passes.
- Follow-up `npm run typecheck` passes after isolating animated preview rAF updates.
- Follow-up `npm run typecheck` passes after fixing pause shortcuts and playhead boundary snapping.
- Follow-up `npm run typecheck` passes after adding smooth transient scrub previews with throttled commits.
- Follow-up `npm run typecheck` passes after adding the setting and app bar width normalization.
- Follow-up `npm run typecheck` passes after coalescing scrub pointer events into rAF previews.
- Follow-up `npm run typecheck` passes after switching scrub preview to transform-based movement and suppressing app sync during active scrubs.
- Follow-up `npm run typecheck` passes after full-height playhead and boundary loop stabilization.
- Follow-up `npm run typecheck` passes after making scrub/click commits take playback time authority while playing.
- Follow-up `npm run typecheck` passes after making scrub authority synchronous before the React commit rAF.
