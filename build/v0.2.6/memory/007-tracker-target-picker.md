Tracker target picker

- Added a pan tracker target picker beside the Tracker input in `TranslationInspector`, using the same crosshair button treatment as the pan position picker.
- The active picker is coordinated in `App.tsx` because it needs to connect the inspector selection to the currently displayed frame preview and commit to the selected translation marker.
- `FramePreview` owns the transient hover hit-testing and blue overlay, reusing frame object/background element ids from rendered `data-*` attributes and the existing selector blue/bounds viewport conversion.
- Tracker pick mode now pauses playback at the current scene time and keeps the composed frame frozen there. Object/background animations and camera motion are no longer reset to source positions, and the hover overlay uses the hit DOM element's rendered viewport bounds so animated targets can be selected precisely at the frozen frame.
- A missed tracker pick now exits picker mode without clearing the previous tracker id. Invalid tracker ids in the inspector use red input text so the id itself is visibly marked without changing the field border.
- Pan timeline blocks with `followId` show a tiny link icon in the lower-left corner to indicate tracker binding without changing marker layout.
- Future picker-like frame interactions should prefer this pattern: keep hover previews local to the preview, then commit only the selected id/value back through an App callback.
