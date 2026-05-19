# Compose vs Direct

How Clipper isolates the two editor sub-modes. Read this before touching `framePreviewProps`, the render model, or selection clearing.

## Modes

| Mode    | Edits                       | Inspector                                                 | Layering                                                                          |
| ------- | --------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Compose | One composition's internals | Object inspector                                          | All scene wrappers (camera, motion, adjustments, transitions, hide-null) disabled |
| Direct  | The master timeline         | Motion / adjustment / transition / composition inspectors | All scene wrappers enabled                                                        |

Modes share **only** the playhead clock. Everything else (selection, picks, zoom, post-process layers, motion markers, adjustment layers) is mode-scoped.

## Render model owns the mode

Mode-zeroing belongs in the render model, not in shell ternaries. The model exposes a single typed config:

```ts
export interface SceneWrapConfig {
  cameraEnabled: boolean;
  adjustmentsEnabled: boolean;
  transitionsEnabled: boolean;
  motionEnabled: boolean;
  hideNullObjects: boolean;
}

export function sceneWrapConfigForMode(mode: TimelineMode): SceneWrapConfig;
```

`deriveFramePreviewRenderModelFromContext` zeros `visibleAdjustmentLayers`, `transitionLayers`, `motionLayers`, `transitionPreviewParts` when their flags are false. The model exposes `sceneWrap` so consumers read one switch instead of inferring mode at every call site.

## One source of truth per consumer

| Consumer                           | Reads from                                           |
| ---------------------------------- | ---------------------------------------------------- |
| `FramePreview` (camera transform)  | `sceneWrap.cameraEnabled`                            |
| `FramePreview` (compositor)        | `sceneWrap.hideNullObjects`                          |
| `selectPreviewStrategy`            | `sceneWrap.cameraEnabled === false` (compose signal) |
| `editorDerivedState` (camera gate) | `sceneWrap`                                          |
| `RenderedMediaExportApp`           | `sceneWrap`                                          |

`timelineMode === "composition"` checks scattered across consumers are forbidden. Read `sceneWrap` instead.

## Composition is sealed

A composition renders as one unit. Scene-level effects (motion, adjustments, transitions) wrap composition output via the wrapper config; they never bleed in by overwriting composition-internal fields.

- `part.motionMarkers` carries composition-internal motion. Always preserved.
- `sceneMotionPart` (separate field on the model) carries scene-level motion rebased into part-local time, for the camera transform layer only.
- `getLayeredCameraPreviewTransform` reads `sceneMotionPart`. Composition-internal motion logic reads `part.motionMarkers`. No silent overwrite.

## One composition source

Both modes resolve compositions via `renderableScene.compositions` — the same list. There is no second `compositionLibrary` lookup path for compose mode.

`displayPart = model.part` in both modes. `displayPreviewTime = model.previewTime`. `partStart = model.activeTimelinePart?.start ?? 0`. The mode-free signature of `resolveDisplayTimeAndPart` is the contract:

```ts
resolveDisplayTimeAndPart(model: Pick<FramePreviewRenderModel, "activeTimelinePart" | "part" | "previewTime">)
  : { displayPart, displayPreviewTime, partStart }
```

## Selection isolation

Mode-scoped selection clears on mode switch:

- `clearDirectSelection()` — clears every Direct-mode selection field, including `selectedObjectId` (object inspector is Compose-only; a stale object id leaks into Direct).
- `clearComposeSelection()` — clears Compose-mode selection.

The fields these actions cover include cross-cutting state: drag box, marquee, pick state, frame pick preview, picking flags. Missing one leaks selection.

The Compose-only object inspector is gated explicitly:

```ts
const composeInspectorObject = composeMode ? (selectedObject ?? null) : null;
```

Direct never falls through to an object inspector even if `selectedObjectId` is somehow set.

## Object-level interactions: Compose only

In Direct, the preview is a flat output (like a video). Object-level interactions are off; only scene-level pickings (focus, tracker, translation position) stay enabled because they target scene motion markers, not composition objects.

Direct-mode forced inert:

- `dragBox`, `framePickPoint`, `selectedObjects`, `objectSnapGuides`
- `marqueeDragging`, `editingTextObjectId`
- `activeShapeTool`, `shapeDrawPreview`

`canSelectFrameObjects` is `timelineMode === "compose"` — that is the only place the mode-bool appears in the prop bag.

## Strategy precedence

The preview strategy router decides which renderer mounts. Order:

```
hasActiveLivePasses    → live-webgl (effects beat authoring; overlays portal on top)
authoringActive        → live-dom (no effects; native handles, drag, text edit)
timelineMode compose   → live-dom (no scene wrappers)
prerenderEnabled       → prerender (cached frames)
fallback               → live-dom
```

`authoringActive` does not suppress live passes. Effects render on canvas; authoring overlays render via the `previewOverlayHost` portal on top of the canvas. Both are visible at once.

`compose-mode` is a second-layer guard: even if a future regression sneaks live passes into a compose composition, the strategy still picks `live-dom`. Two-layer defence (data boundary in the model, strategy boundary in the router).

## Anti-patterns

- `composeMode ?` ternaries inside `framePreviewProps` zeroing scene fields. The model owns this.
- `timelineMode === "composition"` checks scattered across consumers. Read `sceneWrap`.
- A second composition lookup path for compose mode (e.g. `getComposeFilePart`).
- A fallback in `FramePreview` that fabricates a single-element `previewParts` stack from the raw library `part`. Empty `previewParts` means "no active composition" — that is the correct gap signal.
- `clearDirectSelection` that omits a Direct-mode field.
- An in-component re-decision that contradicts the strategy router.

## Key files

- `src/app/state/framePreviewRenderModel.ts` — `SceneWrapConfig`, `sceneWrapConfigForMode`, `sceneMotionPart`, `resolveDisplayTimeAndPart`.
- `src/app/state/editorDerivedState.ts` — `composeInspectorObject` gate, derived structural model.
- `src/app/state/editorStore.tsx` — `clearDirectSelection`, `clearComposeSelection`.
- `src/components/preview/FramePreview.tsx` — reads `sceneWrap.cameraEnabled` / `sceneWrap.hideNullObjects`.
- `src/components/preview/strategies/selectPreviewStrategy.ts` — strategy precedence.
- `src/components/preview/FramePreviewLive.tsx` — passes `sceneMotionPart` and `sceneWrap` through.
- `src/core/timeline.ts` — `getPreviewStackParts` (throws on missing composition; no silent fallback).
