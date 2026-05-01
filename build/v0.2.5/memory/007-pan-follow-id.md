# Pan Follow ID

## Notes

- Started v0.2.5 work to add an optional pan follow-id field and demonstrate it in the White Serif Hero Demo.
- Added `TranslationMarker.followId` as an optional pan marker field. Runtime camera preview resolves it against the active part's frame objects or background elements, using the followed object's animated center as the pan target and `position` as fallback when the id is absent or missing.
- Added smooth `MotionTrack.path` support with Catmull-Rom interpolation. `renderRuntime` owns path evaluation and exports `getMotionTranslation` so camera-follow calculations reuse the same motion math as object rendering.
- Updated the pan inspector with a themed `Tracker` text field for `followId`. Existing X/Y fields remain as fallback/manual pan coordinates.
- Added `Slide 03 - Floating Follow Pan` to `clipper/projects/prj_white_serif_demo`, plus `prt_floating_orb_pan.ts`. The slide keeps the moving circle id as `floating-orb` and sets the pan marker `followId` field to that id.
- Restored slide 03 source to the component-oriented `new Composition` style used by slides 01 and 02. Later v0.2.5 cleanup removed object-list `defineComposition({ objects: [...] })` authoring instead of leaving compatibility in the loader.
- Updated `partToSource` so future code-pane regeneration emits `new Composition({ render() { return [new Rect(...)] } })` style instead of the older object-list format.
- Renamed the authoring/source layer from part naming to composition naming: `src/core/compositionSource.ts`, `clipper/projects/composition-api.ts`, `@clipper/composition-api`, `compositionFromSource`, `compositionToSource`, and `loadCompositionsFromSource`. `clipper/projects/part-api.ts` remains only as a deprecated compatibility shim for persisted older source files.
- Renamed source-cache state from `partSources` to `compositionSources` across the project store, save/export services, derived state, and app shell.
- Migrated the persisted project schema from `scene.parts` to `scene.compositions` in core types, normalization, timelines, Electron export rendering, bundled sample data, and saved project manifests. `normalizeProject` can still read legacy `parts` manifests long enough to migrate them into the new in-memory shape.

## Architecture

- Follow behavior lives in `src/core/camera.ts` because it changes how active pan markers become camera transforms, not how timeline nodes are laid out.
- Motion path interpolation lives in `src/core/renderRuntime.ts` because object rendering and camera follow need a single source of truth for animated translation.
- Demo authoring stays in the persisted White Serif project JSON and composition source file so the project remains openable through normal persistence and code-mode workflows.

## Verification

- `node -e "JSON.parse(require('fs').readFileSync('clipper/projects/prj_white_serif_demo/project.json','utf8')); console.log('project json ok')"`
- `npm run typecheck`
- `npm test -- --run src/core/renderRuntime.test.ts src/core/chartApi.test.ts`
