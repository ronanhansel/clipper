# 025-transition-layer-type

## Overview
Added a new "Transition" layer type that sits on top of all other layers (composition, motion, adjust) on the timeline. Transitions are visual effects that cover the entire frame, affecting all layers below. Implemented as a plugin-like architecture (similar to motion and adjust) so future transitions can be added individually.

## Architecture

### New Types (`src/core/types.ts`)
- **`TransitionEffectId`**: Effect ID alias for transition effects
- **`TransitionEffectParams`**: Params including optional `ease`
- **`TransitionEffectDefinition`**: Manifest definition for transition effects (id, category, name, label, group, accent, timelineGradient, defaultDuration, defaultParams)
- **`TransitionEffect`**: Runtime effect pairing (effectId + params)
- **`TransitionLayer`**: Runtime layer with `id`, `layerId`, `name`, `start`, `duration`, `midPoint` (the transition boundary position), and `effect`
- **`TimelineTransitionLayerState`**: Layer row state (id, name, hidden, locked)
- Added `transitionLayers` to `TimelineLayerState`, `Scene`, `TimelineDocument`
- Extended `EffectCategory` to include `"transition"`
- Extended `EffectDefinition` union to include `TransitionEffectDefinition`

### Plugin System (`src/core/effects/`)
- **`TransitionEffectPackage`** in `types.ts`: Package type with `createDefaultLayer` and optional `applyVisualStyle`
- **`createTransitionEffectPackage`** in `manifest.ts`: Factory that merges YAML manifest with logic
- **`TransitionEffectLogic`** type for transition-specific behavior (currently `applyVisualStyle`)
- **`builtInTransitionEffects`** in `builtins/transitions/index.ts`: Array of built-in transitions
- **Registry additions** in `registry.ts`: `transitionEffectPackages`, `defaultTransitionEffectPackage`, `getTransitionEffectPackage()`, `normalizeTransitionEffectId()`
- **`effects/transitions.ts`**: Barrel export

### Built-in Swipe Transition (`src/core/effects/builtins/transitions/swipe/`)
- **manifest.yml**: Defines id `clipper.transition.swipe`, category `transition`, orange accent (#ff8c42), default duration 2s, default params with ease linear
- **logic.ts**: `swipeTransitionLogic` with `applyVisualStyle` that creates a push-left swipe overlay

### Timeline Integration
- **`timelineLayers.ts`**: Added `"transition"` to `TimelineLayerCategory`, `"transitionLayers"` to `TimelineLayerStateKey`, updated `getTimelineLayerStateKey()`
- **`project.ts`**: Added default transition layer `{ id: "transition", name: "Transition" }`, transitionLayers flow through `getSceneFromProjectWithDocs` and `getScenesFromTimelines`
- **`directTimelineModel.ts`**: Transition rows rendered at the TOP (above adjustment, motion, composition)

### Layer Commands (`src/app/features/timeline/`)
- **`timelineLayerHelpers.ts`**: `createTransitionTimelineLayer()`, `createBlankTransitionLayer()`
- **`useTimelineLayerCommands.ts`**: `addTransitionTimelineLayer()`, `removeTransitionTimelineLayer()`, `transitionLayerRowId()`

### Timeline Rendering (`src/components/timeline/`)
- **`TimelinePrimitives.tsx`**: New `TransitionBlock` component with:
  - Orange gradient background
  - ArrowLeftRight icon at center
  - Vertical boundary line at `midPointPercent` position
  - Left/right resize handles
- **`DirectTimelinePanel.tsx`**: 
  - Added `transitionRows` destructuring from `buildDirectTimelineModel`
  - Transition layer labels in layer rail (top, before adjustments)
  - Transition blocks in viewport lanes with data attributes
  - `updateTransitionFromPointer()` function for resize/move interactions
  - `isTransitionLocked()` helper
  - `getTimelineTransitionElement()` DOM query helper
- **`TimelinePanelProps`** extended with transition-related props (transitionLayers, selectedTransitionLayerId, selectedTransitionLayers, add/remove/select/move/update/addEffect callbacks)
- **`timelineBlockPreview.ts`**: Added `"transition"` to `TimelineBlockPreviewKind`, added optional `midPoint` to `TimelineBlockPreview`

### Transition Resize/Move Behavior
The `updateTransitionFromPointer` function implements special transition marker behavior:
- **Move**: Entire block moves, `midPoint` stays relative to start
- **Left resize**: Changes `start`, `midPoint` stays at same absolute position (IN side compresses/expands)
- **Right resize**: Changes end (`start + duration`), `midPoint` stays at same absolute position (OUT side compresses/expands)
- **Shift + resize**: Both sides resize equally from the midpoint (symmetrical expansion/contraction)
- Uses `previewMapFromBlocks("transition", ...)` for real-time preview
- Snap boundaries include all block edges for magnetic snapping

### App Integration (`src/App.tsx`)
- Import `getTransitionEffectPackage` from registry
- Destructure `addTransitionTimelineLayer`, `removeTransitionTimelineLayer` from `useTimelineLayerCommands`
- Added inline transition commands: `selectTransitionLayer()`, `selectTransitionLayers()`, `moveTransitionLayer()`, `updateTransitionLayer()`, `addTransitionLayerAt()`
- Wired transition props through `TimelineProvider` to `DirectTimelinePanel`

### Editor State (`src/app/state/editorStore.tsx`)
- Added `selectedTransitionLayerId` and `selectedTransitionLayers` to state and actions
- Added setters via `createFieldSetter`
- Cleared on `clearNodeSelection` and initialized on project load

### Context Menu (`src/app/types.ts`)
- Added `{ kind: "transition"; layerId: string }` to `TimelineNodeContextTarget`

### Clipboard Commands (`src/app/features/timeline/useTimelineClipboardCommands.ts`)
- Added type guard for `target.kind === "transition"` (returns null, no clipboard operations yet)
- Updated `openTimelineNodeContextMenu` to handle transition kind

## Drag-and-Drop from Effects Panel
- Transition effect cards appear in the **Transition** section of the Tools panel, above Adjust
- Custom pointer drag system (`handleEffectPointerDrag`) handles transition drops onto transition lanes
- Native HTML5 drag fallback via `allowTransitionEffectDrop`/`dropTransitionEffect`
- Drop preview via `previewTransitionEffectDrop` → `getEffectPreviewBase` (already handles transition category)
- `addTransitionLayerAt()` in App.tsx creates the layer and passes `layerId` so the rendering filter matches

## Snapping & Resize Behavior (Revised)
- **Move**: Uses `getTimelineBlockTiming("move")` identically to other markers — same drag speed, same snap behavior
- **Left resize**: `getTimelineBlockTiming("start")` snaps start to block edges; midPoint stays at absolute position (boundary fixed)
- **Right resize**: `getTimelineBlockTiming("end")` snaps end to block edges; midPoint stays at absolute position
- **Shift+resize**: Both sides resize symmetrically from midpoint (midPoint moves)
- **Middle snap**: `getTimelineSnapGuideTime` checks if the absolute midpoint is near any boundary; if so, snaps to that boundary
- **Snap boundaries**: `getUniversalBlockSnapBoundaries` now includes transition layer edges (start, end, midpoint) as snap targets via `excludeTransitionIds` option

## Unified Block Interaction (`startBlockPointerInteraction`)
All three block types (composition, adjustment, transition) use a single `startBlockPointerInteraction<T>` function with identical interaction logic:
- Lock check, selection, element lookup, scroll-aware delta computation
- `getTimelineBlockTiming()` call with snap boundaries — same timing engine across all types
- `previewMapFromBlocks()` for resize preview / `applyTimelineBlockPreview()` for move preview
- `startTimelinePointerTransaction()` lifecycle (onPreview/onCommit/onCancel/onDragEnd)
- Each type provides its own `transformTiming` callback for type-specific post-processing (transition midPoint constraints, etc.)
- Multi-selection move/resize for composition and adjustment is handled as inline wrappers that delegate back to `startBlockPointerInteraction` for single-item interactions

Configuration per type:
| Type | Category | PreviewKind | ResizeCssVar | transformTiming |
|---|---|---|---|---|
| Composition | `"comp"` | `"composition"` | `--clipper-composition-resize-width` | identity |
| Adjust | `"adjust"` | `"adjustment"` | `--clipper-adjustment-resize-width` | identity |
| Transition | `"transition"` | `"transition"` | `--clipper-transition-resize-width` | midPoint constraints + middle snap |

Motion markers retain their own handler due to fundamentally different timing (mended chains, part-to-part movement, `getTimelineMarkerMoves`).

## Future Work
- Transition inspector panel with ease dropdown
- Additional built-in transitions (dissolve, fade, wipe, etc.)
- Visual preview integration in renderRuntime (currently layers render on timeline only)
- Selection marquee for transition blocks
- Clipboard copy/paste for transition layers
- Per-transition ease control via inspector (midPoint ease curve)
