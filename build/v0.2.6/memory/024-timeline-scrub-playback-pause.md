# Timeline Scrub Playback Pause

## Summary

- Timeline playhead scrubbing now pauses playback while the pointer is captured by the ruler scrub interaction.
- Playback resumes on release/cancel only when it was running at scrub start.
- Presentation-mode range scrubbing uses the same pause-until-release behavior.

## Architecture Note

`TimelinePanel` exposes `onScrubStart` and `onScrubEnd` callbacks around its existing pointer-captured scrub lifecycle. `AppContent` owns the playback state, so it pauses via the same settled playhead path used by the play/pause button, then restarts from `currentSceneTimeRef` after the final immediate scrub commit. This keeps timeline pointer handling local while keeping playback orchestration in the editor shell.

The presentation scrubber is owned directly by `AppContent`, so it calls the same playback helpers from its pointer handlers and tracks whether that scrub interaction paused playback with a dedicated ref.
