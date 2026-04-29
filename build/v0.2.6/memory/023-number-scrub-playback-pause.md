# Number Scrub Playback Pause

## Summary

- Number input scrubbing now pauses timeline playback while the scrub is active.
- If playback was running when the numeric scrub began, playback resumes automatically after mouse release, pointer unlock, Escape cancel, or component cleanup ends the scrub.

## Architecture Note

The shared `Input` primitive emits `clipper:number-input-scrub-start` and `clipper:number-input-scrub-end` only when a pending number drag crosses the scrub activation threshold. `AppContent` listens for those lifecycle events, settles the playhead with the existing playback DOM/editor-state commit path, then restarts playback from the current scene time only if it was the numeric scrub that paused playback. This keeps the primitive decoupled from editor state and avoids pausing playback for simple clicks or double-click select-all.
