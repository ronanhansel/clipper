# Composition Library Persistence & Drag-to-Timeline Fix

## Bugs

1. New compositions created via File Manager appeared in the library tree but **could not be dragged onto the timeline** (drag preview showed, but on drop the composition vanished).
2. New compositions were **lost after restart** — neither the `.ts` source nor the library entry survived a project reload.

## Root Cause: Two independent composition registries

The project manifest tracks compositions in **two separate arrays**:
- `project.compositions: CompositionDocument[]` — "timeline compositions" used by `getCompositionDocuments` to build scene compositions and by `saveZipProject` to write `.ts` files into `.clipper` containers.
- `project.compositionLibrary: CompositionClip[]` — "library compositions" used solely by the File Manager tree.

A composition created via `createCompositionInLibrary` was added **only** to `compositionLibrary`, never to `compositions`. This caused three cascading failures:

### 1. Normalization dropped library sources

`normalizeProject` rebuilt `compositionSources` from `compositionDocuments` (timeline-only), stripping any source entries for library-only compositions. Downstream, `getProjectCompositionSources` threw when it encountered a library composition with no inline source and no entry in `compositionSources`.

`replaceProject` on the `syncSources: false` path (used by `syncCompositionResult` after creating a composition) would **crash**, preventing the project state update entirely.

### 2. Library compositions were invisible to the timeline

`getCompositionDocuments` only read `project.compositions`. The scene builder (`getScenesFromTimelines`) looked up `clip.compositionId` in `compositionDocuments` — a library-only composition was never found, so the timeline clip was **silently skipped** during scene construction.

### 3. Library `.ts` files were never saved to `.clipper` containers

`saveZipProject` iterated only over `normalized.compositions` to write composition `.ts` files into the zip. Library-only compositions had no `.ts` entry. On reload, `loadZipCompositions` only found files in `compositions/`, so the composition was gone.

## Fixes

### `src/core/project.ts:154-158` — `getCompositionDocuments` merges `compositionLibrary`

Changed from:
```ts
const compositions = project.compositions ?? [];
return Array.from(new Map(compositions.map(...)).values());
```

To:
```ts
const compositions = [...(project.compositionLibrary ?? []), ...(project.compositions ?? [])];
```

This makes all library compositions available for timeline scene construction and, critically, for `saveZipProject` persistence (because they now flow into `normalized.compositions`).

`normalizeCompositionDocument` was made lenient: returns `undefined` when a source is missing (filtered out) instead of throwing.

### `src/core/project.ts:149-151` — `getCompositionLibrary` preserves inline `source`

Previously returned bare `normalizeComposition(composition)`, which did not carry `source`. Changed to:
```ts
{ ...normalizeComposition(composition), source: composition.source }
```

This allows library compositions to carry their source through normalization without relying solely on `compositionSources`.

### `src/core/project.ts:312` — `normalizeProject` merges library sources

`compositionSources` is now built from **both** `compositionLibrary` (source present) and `compositionDocuments`:
```ts
Object.fromEntries([...(project.compositionLibrary ?? []).filter((c) => c.source).map((c) => [c.filePath, c.source!]), ...compositionDocuments.map((c) => [c.filePath, c.source])])
```

Timeline sources take precedence (applied second).

### `src/app/project/useProjectDocumentController.ts:76-77` — `syncSources: false` preserves ref sources

The `else` branch in `replaceProject` was using `getProjectCompositionSources(normalizedProject)`, which threw for library-only compositions. Changed to:
```ts
nextCompositionSources = compositionSourcesRef.current;
```

Callers of `replaceProject` with `syncSources: false` (`syncCompositionResult`, `applyFileManagerTreeSnapshot`) already pre-populate `compositionSourcesRef.current` with the correct sources before calling `updateProject`.

### `src/app/features/file-manager/compositionLibraryMutations.ts:25-35` — `createCompositionInLibrary` uses clean defaults

Removed `...basePart` spread (previously leaked the currently-open composition's data into new compositions). Uses explicit defaults for all fields. The `source` field is placed directly on the library entry and in `compositionSources`.

## Architecture notes

- `project.compositions` and `project.compositionLibrary` are now effectively merged at the `getCompositionDocuments` boundary. Both arrays should be kept in sync for consistency, but the merge provides a safety net.
- Library compositions are distinct from timeline compositions: library entries are `CompositionClip` (source optional), timeline entries are `CompositionDocument` (source required). The merge in `getCompositionDocuments` produces `CompositionDocument` objects.
- Source lookup order in `normalizeCompositionDocument`: `composition.source` (inline) → `sources[composition.filePath]` (from `compositionSources`).
- The `syncSources: false` path in `replaceProject` is used when the caller has externally managed the source map. The ref-based bypass avoids redundant `getProjectCompositionSources` calls.
- For future work: consider unifying `compositions` and `compositionLibrary` into a single source of truth to avoid this class of bugs entirely.
