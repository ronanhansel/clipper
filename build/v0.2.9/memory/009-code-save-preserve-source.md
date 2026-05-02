# Code Save Preserve Source

## Goal

Fix code-pane saves reverting composition source to an older/generated state.

## Investigation

- `CodePane` applies edits through `updateCompositionFromSource()` on every Monaco change.
- That path updates `compositionSourcesRef` immediately with the raw editor source, then asynchronously evaluates it into normalized composition state.
- `saveProject()` was calling `getSyncedCompositionSources(projectToSave, savedSnapshotProject, compositionSourcesRef.current)` again during save.
- Because the evaluated composition differs from the last saved snapshot, that save-time sync can call `compositionToSource(nextPart)` and overwrite the raw authored code with generated source.

## Architecture Note

- Low-code project edits should continue syncing source at mutation time through `replaceProject(..., syncSources !== false)`.
- Explicit saves of the current project should persist the live `compositionSourcesRef` as the source of truth, rather than regenerating composition source during save.

## Implementation

- Updated `saveProject()` in `src/app/project/useProjectDocumentController.ts` to use `compositionSourcesRef.current` when saving the live project.
- `updateCompositionFromSource()` now also writes the raw editor `source` onto the evaluated composition document so `normalizeProject()` cannot prefer stale `composition.source` over the live source map during save.
- For explicit non-current project saves, the source map is still derived from that override project with `getProjectCompositionSources()`.
- Removed the now-unused saved-snapshot parsing helper from the controller.
- Tightened `src/core/compositionApi.ts` from broad `Record<string, unknown>` constructors to explicit authoring prop types for bounds, styles, motion, animations, renderables, groups, and compositions.
- `CompositionProps` includes optional `id` and `name` metadata because existing authored project sources use composition-level IDs.
- Replaced the duplicated `compositionApiSource` string with a Vite raw import of `compositionApi.ts`, so Monaco editor typings use the same API definitions as runtime evaluation.

## Verification

- `npm run typecheck` passes.
