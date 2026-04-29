# Effect Nodes And Timeline Interactions

This guide explains how to add new effect nodes while keeping timeline behavior consistent, independent per layer, and performant.

## Current Effect Families

- Composition blocks live in scene `compositions` and render on the `Comp` row.
- Adjustment effects live in scene `adjustmentLayers` and render on the `Adjust` row.
- Motion effects live inside composition markers and render on configurable motion rows.
- Zoom markers live in `zoomMarkers`.
- Pan and rotate markers currently share `translationMarkers`; their effect kind is separated by `TranslationMarker.kind` and their row is separated by `layerId`.

## Visual Adjustment Packages

- Built-in adjustment packages live as one folder per effect under `src/core/effects/builtins/adjustments/`, with app-facing package metadata in `manifest.yml` and behavior in `logic.ts`, and are exported through `src/core/effects/builtins/adjustments/index.ts`.
- Visual-only packages should implement `AdjustmentEffectPackage.applyVisualStyle(...)` and return CSS-compatible style fields. Current Colour Grade and Blur effects compose through the `filter` property.
- `applyAdjustmentLayersToVisualStyle(...)` in `src/core/adjustments.ts` is the shared composition point for preview/export visual styles. Do not duplicate visual-effect lookup logic in React components.
- `FramePreview` applies visual adjustment styles to the `[data-clipper-visual-adjustments]` wrapper so filters affect rendered frame contents without affecting editor overlays.
- Aesthetic overlay packages should return `overlays` from `applyVisualStyle(...)`. Each overlay is a deterministic absolute-fill CSS style descriptor and should avoid external assets unless asset packaging/export support is added.
- Overlay descriptors may set `target: "frame" | "camera"`. `camera` is the default and renders outside the perspective stage so panning/zooming/perspective motion does not move or cut through the overlay. `frame` renders inside camera/frame motion and must stay above arbitrary frame HTML with explicit high z-index.
- Preview renders overlay descriptors inside `[data-clipper-visual-adjustment-overlays]`; scrub previews may update this container imperatively for immediate feedback.
- Electron export must mirror preview behavior for new visual packages. Add or update export filter handling when adding a package whose visual style cannot be represented by the existing CSS-filter path.
- Keep lightweight visual effects CSS-filter based unless a future WebGL render path exists. Avoid CPU pixel manipulation for playback/export because it scales poorly at video frame sizes.

## Package Metadata Rules

- Effect packages own their UI metadata: `label`, `group`, `accent`, `previewColor`, `timelineGradient`, `defaultDuration`, `paramControls`, and `pointControls`.
- New built-in effects should use `src/core/effects/builtins/<family>/<effectName>/manifest.yml` for properties and `logic.ts` for runtime behavior. Do not add new flat sibling files such as `<effectName>.ts` for package definitions.
- Keep effect folders modular as plugin boundaries. If an effect later needs specialized UI, export, preview, validation, assets, or editor behavior, add narrowly named files inside that effect folder or shared framework modules instead of mixing unrelated responsibilities into `logic.ts`, registry files, inspector components, or timeline components.
- `group` is a manifest-authored folder path for the Effects tools panel. Built-in adjustment groups are `Timing`, `Visual`, and `Overlay`; built-in motion groups are `Scale` and `Disposition`. Use `/` only when a future group needs nested folders; the app only presents these folders and does not create, edit, reorder, or persist them at runtime.
- `previewColor` controls the source drag ghost color. `timelineGradient` controls timeline blocks and drop previews. Built-ins currently standardize these to the Frame Skip purple presentation, but the values intentionally remain package-owned.
- Inspector fields for package parameters are generated from `paramControls`; do not branch on individual effect ids for normal numeric controls.
- Frame-pickable adjustment coordinates should be declared through `pointControls` with package-owned `xKey`, `yKey`, defaults, and coordinate space. The app should not add effect-id branches for new pickable adjustment effects.
- Package controls can declare `disabledWhen` conditions so dependent controls disable consistently without effect-specific inspector branching.
- Each numeric `paramControls` entry should provide a meaningful `defaultValue`. The inspector passes this value to the shared number field as `resetValue`, which enables the field reset affordance.
- Visual adjustment parameter inputs use `numberScrubMode="continuous"` with a short throttle so dragging fields like Brightness, Contrast, Saturation, Hue, and Blur Radius updates the frame preview before mouse release.
- If a new parameter should not update continuously, document why in the package or inspector code before using the default commit-on-release number scrub mode.

## Add A New Effect Node

1. First decide whether the requested effect can be expressed with the currently supported effect API, app interfaces, and render/export framework.
2. If the current API cannot express the effect cleanly, extend the framework first. Add generic manifest fields, shared controls, render descriptors, preview/export adapters, timeline behavior, or project-state support that can serve multiple downstream effects and applications, not just the one new built-in.
3. Keep the app layout and effect APIs dynamic enough for multi-purpose usage. Prefer metadata-driven UI and stable render/runtime contracts over hard-coded branches for individual effect ids.
4. Only after the framework can represent the effect, create the built-in effect folder under `src/core/effects/builtins/<family>/<effectName>/`.
5. Put static app-facing properties in `manifest.yml`, deterministic runtime behavior in `logic.ts`, and future specialized concerns in separate files such as `controls.ts`, `preview.ts`, `export.ts`, `assets.ts`, or `validation.ts` when those boundaries become real.
6. Add the persisted type in `src/core/types.ts` when the effect introduces new project data shape rather than only new parameter values.
7. Add normalization/defaulting in `src/core/project.ts` if the new data can come from older project files.
8. Add deterministic math in `src/core` or the effect's focused runtime file, not directly in React. Examples include placement, snapping, active-effect lookup, interpolation, and render/runtime evaluation.
9. Add editor mutation commands in the app/project state layer. Do not mutate project data from timeline components directly.
10. Add creation UI through manifest-driven tools or relevant shared inspector controls. If a new control type is needed, add it generically so other effects can reuse it.
11. Add timeline rendering in `src/components/timeline/TimelinePanel.tsx` or extract a focused lane component if the logic grows.
12. Add preview/export support in the render/camera/runtime path if the effect changes output frames, and keep preview/export behavior compatible.
13. Add tests for pure placement, snapping, active-effect, manifest parsing, and render math where possible.

## Timeline Independence Rules

- Treat each visible lane as an independent scheduling surface.
- Collision and push constraints must only consider nodes on the same lane/layer unless the feature explicitly links multiple lanes.
- If multiple effect kinds share the same underlying array, always filter by a stable lane key before resizing, moving, snapping, or finding gaps.
- `layerId` is the canonical lane identity for motion effects. Do not infer a target lane only from effect kind once custom rows exist.
- Vacant rows may adopt the kind of the first dropped or moved motion effect, but rows with existing markers must keep their current kind unless the user explicitly changes them.
- Selection state should identify both parent composition/layer and node id. Never rely on node id alone across the timeline.

## Drag And Resize Rules

- Effect drags from the tools panel should use pointer-driven custom drags rather than native HTML `draggable` where immediate release cleanup matters. Keep the source ghost in `src/components/ToolsPanel.tsx` and keep lane placement previews in `src/components/timeline/TimelinePanel.tsx`.
- Timeline effect previews should follow the current cursor-derived scene time on each `dragover`, then apply snapping and lane gap constraints. Do not preserve the first timeline-enter offset for external effect drags because it makes the preview feel detached from the cursor.
- New draggable effects must define a reproducible drag label and accent alongside the tool button, using the same color family as the eventual timeline block.
- Pointer-driven source drags should communicate with the timeline through the `clipper:effect-pointer-drag` event and should clear the source ghost synchronously on pointer release/cancel.
- The source ghost should hide only while a timeline preview node is active. If the pointer leaves a valid timeline drop row before release, the preview deactivates and the source ghost should reappear under the cursor.
- Use rAF-throttled transient previews during pointer movement.
- Prefer imperative DOM previews with `transform`, `translate3d`, CSS variables, opacity, width, and height.
- Commit canonical project state once on pointer up/cancel, blur, or another explicit finalization event.
- Do not write project state, persist history, or rebuild expensive derived trees on every pointermove.
- Preserve snapping, clamping, no-overlap, mended-chain, and selection semantics when optimizing previews.
- For vertical cross-layer drags, compute the target row from pointer Y, then preview whole-row `deltaY` and destination row height.
- For horizontal movement, compute constraints against the target layer, not the source layer or the whole effect array.
- For resize, compute push constraints inside the current layer only, then merge changed nodes back into the canonical collection.
- Keep drag-hover suppression scoped to the timeline container. Do not globally disable pointer interactions across the app unless the behavior is intentionally app-wide.

## Snapping Rules

- Scrub snapping and node snapping should use shared timeline boundary helpers where possible.
- Composition boundary guides should be rendered as timeline-wide overlays when dragging nodes across layers, similar to the playhead.
- Snap thresholds should be derived from pixels-per-second so zoom level affects feel consistently.
- Modifier keys such as Shift must update active previews without requiring a new drag.

## Rendering Rules

- Lane blocks should fill the row height unless there is a deliberate nested layout.
- Lane overflow should normally stay hidden.
- During cross-layer drag previews, allow overflow only for the active drag window or render a dedicated overlay.
- Overlays that must span rows, such as playhead and composition boundary guides, should live above the lane grid rather than inside individual lanes.
- Menus and popovers inside clipped timeline rails should render through a portal.

## State Boundaries

- `src/core` owns pure timeline and render calculations.
- `src/components/timeline/TimelinePanel.tsx` owns local pointer/rAF machinery and visual previews.
- App/project state owns canonical mutations such as adding, moving, resizing, deleting, and selecting effect nodes.
- Timeline components should call semantic callbacks such as `onMoveZoomMarker`, `onMoveTranslationMarkers`, or `onUpdateTranslationMarkers` rather than editing project structures directly.
- Keep high-frequency preview state local. Promote state only when other app areas need the canonical result.
- During timeline scrubbing, the playhead and visual adjustment preview can use imperative DOM updates for immediate feedback, but canonical scene time still flows through the editor store.

## Checklist For New Timeline Interactions

- The node can be selected, multi-selected if appropriate, moved, resized, deleted, copied if supported, and inspected.
- Movement across composition boundaries preserves duration and lands in a valid target composition.
- Movement across layers snaps to full destination rows and commits the correct `layerId`.
- Resize handles do not trigger parent lane selection or block movement through unrelated layers.
- Hover states do not flicker or glow while actively dragging inside the timeline.
- Boundary guides, playhead, selection boxes, and drag previews use consistent z-index layering.
- Empty/vacant layers behave predictably when receiving the first node.
- Typecheck and relevant tests pass.

## Common Failure Modes

- A shared array causes unrelated lanes to block each other during resize or move.
- A lane-local overlay gets clipped and does not span all rows.
- A drag preview changes visually but commits to the source layer because `targetLayerId` was not threaded into the commit path.
- A portal menu is not used inside a clipped rail, so the menu appears not to open.
- Pointermove commits project state repeatedly, causing jank and broken undo history.
