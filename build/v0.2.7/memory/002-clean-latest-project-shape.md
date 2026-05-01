# Clean Latest Project Shape

## Goal

Remove unpublished-era legacy migration, deprecated handlers, fallback sample projects, and startup placeholder compositions/timelines so the app only operates on the current project format.

## Notes

- Started from an audit of project normalization, persistence, startup boot, timeline helpers, and fallback project data.
- Removed `src/fallbackProject.ts` and changed startup to show an explicit no-project state with an Open Project action instead of booting a bundled untitled composition.
- `normalizeProject` now requires current-format timelines and composition documents with source. It no longer reconstructs timelines/compositions from scene contents or generates source when the persisted project is incomplete.
- Project persistence no longer catches load failures into a sample project, no longer migrates composition library sources, and no longer creates base placeholder compositions when TypeScript source parsing fails.
- Runtime scenes remain derived from current timeline documents and composition documents because the editor still consumes `project.scenes`; this is a projection layer, not a migration source.
- Removed deprecated timeline alias export, deprecated annotations, hardcoded preview demo animations, and motion-layer matching that treated missing `layerId` markers as current data.
- Verification: `npm run typecheck` and `npm test` pass after the cleanup.
- Follow-up: empty current-format timelines must be valid without creating placeholder timeline data. `useEditorDerivedState` now returns a blank preview-only composition object for rendering when a timeline has no active composition, and `AppContent` renders inactive preview/code messages in that state.
- Backspace/Delete handling now treats range inputs as non-text controls, so timeline deletion shortcuts still work after timeline/scrubber interactions while text inputs, textareas, selects, contenteditable fields, and Monaco keep normal editing behavior.
- Follow-up fix: adjustment layer add/update/delete must write to canonical `project.timelines[].adjustmentLayers`; writing only to derived `project.scenes` is discarded by normalization. `updateSceneAdjustmentLayers` now updates the matching timeline and mirrors the same computed layer array to the runtime scene.
- Timeline single source-of-truth cleanup: timeline clip mutations now write to `project.timelines[].clips` via `updateSceneParts`, while `project.scenes` remains a normalized runtime projection only. Timeline-level motion markers are now stored on `TimelineDocument.zoomMarkers` / `translationMarkers`, not source scenes. Timeline create/rename/reorder/delete and file-manager folder updates now operate on `project.timelines`; normalization derives scenes from timelines and composition documents.
