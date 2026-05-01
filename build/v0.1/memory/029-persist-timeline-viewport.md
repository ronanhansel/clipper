# Persist Timeline Viewport

- User requested that Timeline displacement and zoom level be saved to project state.
- Added optional `editorState.timeline` to `ProjectManifest` with `displacement` for horizontal scroll offset and `zoom` for the timeline scale.
- `normalizeProject` now backfills and clamps timeline viewport state for older project JSON without that field.
- `TimelinePanel` now restores saved scroll displacement and zoom from project state, and writes changes back so the master Save path persists them to `project.json`.
