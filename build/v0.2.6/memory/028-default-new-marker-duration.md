# Default New Marker Duration

Added a Timeline settings control for the default duration of new motion markers dragged onto the timeline. The setting lives in the scoped editor store as `defaultNewMarkerDurationSeconds`, defaults to `3`, and is persisted through `EditorState.defaultNewMarkerDurationSeconds` so it survives project reloads.

`SettingsDialog` owns the numeric input and reset control alongside the existing scrub throttle setting. `TimelinePanel` receives the value for drag-preview sizing and computes drop center from the preview duration, while `App.addMotionEffect` uses the same value when creating the marker so preview and committed state stay aligned.
