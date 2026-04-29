# Compose Page

## Goal

Rename the former Edit timeline mode to Compose and evolve it into a focused composition editing surface. Compose should show only the timeline composition currently under the playhead, keep animation previews enabled, and expose a left-side layer tree for low-code editing.

## Architecture Note

- Compose remains a `TimelineMode` because it controls timeline/preview semantics and object-edit affordances.
- Old persisted `timelineMode: "edit"` values must normalize to `"compose"` to preserve existing projects.
- Compose-specific shell layout should live separately from the general editor layout so the new Layers panel does not reuse or disturb the Assets/Effects panel width.
- The first layer tree is built from normalized runtime composition data (`part.background.elements` and `part.objects`). True authored `Component`/`Group` nesting will require source-evaluation metadata because the current renderer flattens renderables in `compositionSource.ts`.

## Reference Notes

- Penpot's layer sidebar keeps viewport interaction separate from layer rendering, coalesces hover highlights, supports nested expand/collapse, and persists sidebar sizing independently.

## Implementation

- Bumped package metadata to `0.2.8` and created `build/v0.2.8/PLAN.md` with the Composition page focus.
- Renamed `TimelineMode` from `"edit"` to `"compose"`; `normalizeProject()` maps old saved `"edit"` state to `"compose"`.
- Compose mode now resolves the active composition from `timelinePartAtTime` only. If the playhead is not over a clip, the preview and layer panel show an empty state instead of falling back to the selected or first composition.
- `FramePreview` no longer disables object/background animations in Compose. Object selection remains gated by `timelineMode === "compose"`.
- Timeline composition blocks now accept a double-click callback. `App.openComposePart()` selects the clip, moves the playhead to the clip start when needed, and switches to Compose.
- Added `EditorState.composeLayout` plus `defaultComposeLayoutState` for an independently persisted Compose left-panel width. Resizing uses the existing rAF CSS-variable preview pattern and commits once on pointer release.
- Added `src/components/compose/ComposeLayersPanel.tsx`, a `react-arborist` tree for the normalized composition root, frame, background elements, and objects. Object layer selection maps to the existing frame selection payload so the interactive screen and inspector can reuse current object-edit flows; non-object layer rows keep local panel selection only.
- Layer rows use distinct icons by element type (`rect`, `text`, `image`, `svg`, `html`, `template`, `chart`) instead of text type pills. Rect and template use small inline SVG icons where the icon set did not provide an exact match.
- Compose object rows can now be dragged within the Objects group to reorder `composition.objects`; this commits through `updateCompositionForTimelinePart()` so source/project sync uses the canonical composition update path.
- File Manager composition rows no longer stop pointer-down propagation when starting the timeline drag preview, so selecting a different composition file immediately replaces the previous selection instead of first clearing it.
- Extracted the File Manager row click wrapper to `src/components/tree/ArboristClickRow.tsx` and reused it in both File Manager and Compose. Compose-specific handlers now live on the shared Arborist row layer while styling remains in `ComposeLayersPanel`.
- The Compose panel heading now uses normal title case styling instead of all-caps letter spacing.
- The Compose layer tree container has a small inset padding to match the File Manager's softer row spacing while keeping rows compact.
- Compose layer drag-and-drop uses a File Manager-matched `ProjectTreeCursor` renderer: a thin accent line with no Arborist default blue circle marker.
- Fixed shared Arborist row behavior by matching `react-arborist`'s default row implementation: rows call `node.handleClick()` directly and stop focus propagation before applying Clipper-specific row actions. Using `attrs.onClick` did not drive Arborist selection in File Manager, which caused first clicks on another item to only clear focus/selection state.
- Compose layer selection is tracked locally as `selectedLayerId` rather than by Arborist's controlled `selection` prop. Rows select on primary `pointerdown`, before Arborist click/focus/toggle handling, and the local selection is preserved while the selected layer still exists in the current tree.
- Object rows still map to app-level `selectedObjectId` editing, while Frame, Background, and group rows can remain visually selected without pretending to be editable frame objects.
- Compose object rows now attach Arborist's `dragHandle` ref, so object layer drag-and-drop can start and commit through `reorderComposeObjects()`.
- Compose Layers now mirrors File Manager's drag/drop cursor control instead of only copying cursor styling: it tracks the pointer during Arborist drag previews, hides the cursor unless the pointer is inside the tree and close to Arborist's cursor line, and uses the same thin accent `ProjectTreeCursor` treatment.
- Compose Layers supports multi-select and marquee selection. Visual selection can include Frame, Background, and group rows, while only draggable object rows are written into Arborist's internal DnD selection and app-level `selectionPayload` so mixed selections do not disable object reordering.
- `App.selectComposeLayerObjects()` maps multiple selected object rows into the existing frame selection payload, enabling multi-object preview selection from the layer tree.
- Selecting object rows in Compose Layers now forces the right Inspector to the `video` tab, clears text-edit mode, sets `selectedObjectId`, and updates the frame `selectionPayload`; this makes the frame selector overlay and object inspector follow layer selection.

## Verification

- `npm run typecheck` passes.
- `npm test` passes with 84 tests, including a migration test for old `timelineMode: "edit"` state.

## Follow-Ups

- The current tree reflects normalized runtime objects. Authored `Component` and `Group` nesting still requires source-evaluation metadata because `compositionSource.ts` flattens renderables.
- Background element selection is visible through selection bounds, but property editing still needs dedicated background-element update paths before it can match object editing end-to-end.
