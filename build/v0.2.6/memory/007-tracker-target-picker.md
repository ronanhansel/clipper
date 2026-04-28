Tracker target picker

- Added a pan tracker target picker beside the Tracker input in `TranslationInspector`, using the same crosshair button treatment as the pan position picker.
- The active picker is coordinated in `App.tsx` because it needs to connect the inspector selection to the currently displayed frame preview and commit to the selected translation marker.
- `FramePreview` owns the transient hover hit-testing and blue overlay, reusing frame object/background element ids from rendered `data-*` attributes and the existing selector blue/bounds viewport conversion.
- Tracker pick mode renders the frame like edit mode: object/background animations are disabled and the camera transform is forced to identity so hit targets stay at source positions.
- Pan timeline blocks with `followId` show a tiny link icon in the lower-left corner to indicate tracker binding without changing marker layout.
- Future picker-like frame interactions should prefer this pattern: keep hover previews local to the preview, then commit only the selected id/value back through an App callback.
