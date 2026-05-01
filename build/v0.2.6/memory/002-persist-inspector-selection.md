## Persist Inspector Selection

- Added editor-state persistence for the primary selected composition and primary motion marker so the inspector can restore the same target implicitly after reload/open.
- `EditorState` now carries `selectedPartId`, `selectedZoomMarker`, and `selectedTranslationMarker`; the App-level editor-state autosave effect writes those alongside mode, panel, and preview state.
- Project normalization validates stored selections against the active timeline and drops stale marker references. Zoom selections take precedence over translation selections because the inspector renders zoom before translation.
- The editor store hydrates these fields into its canonical selection state, including the single-item selection arrays used by timeline highlighting and inspector multi-selection counts. Applying persisted editor state clears non-persisted inspector targets so restored composition/marker selections are not masked by stale in-memory adjustment/object selections.

Architecture note: selection persistence stays in `src/core/types.ts` and `src/core/project.ts` because it is project editor-state shape and validation, while Zustand hydration remains in `src/app/state/editorStore.tsx`. Future inspector-restored selections should follow the same path: persist only stable IDs in `EditorState`, normalize them against the loaded project, then hydrate the scoped editor store.
