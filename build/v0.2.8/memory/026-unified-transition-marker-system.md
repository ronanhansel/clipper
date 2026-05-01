# 026 — Unified Transition Marker System

## Summary

Unified the transition marker rendering, selection, deletion, clipboard, and box-selection systems with the existing shared marker infrastructure. Transitions now use the same `TimelineBlock` component, the same `deleteSelectedTimelineNodes` / `Backspace` pipeline, the same clipboard (copy/cut/paste) types, the same box-selection loop, the same click-to-select flow, and the same `clearNodeSelection` store action as adjustments, motion markers, and compositions.

## Changes

### TimelinePrimitives.tsx
- Removed `TransitionBlock` component and `getDefaultTimelineTransitionGradient` function.
- Added `"transition"` variant to `TimelineBlock`'s `variant` prop and to `getDefaultTimelineGradient`.
- Removed unused `ArrowLeftRight` import (now used inline by consumers).
- Added `"transition"` handling to `EffectDragPreviewBlock` gradient branch.

### DirectTimelinePanel.tsx
- Replaced `<TransitionBlock>` with `<TimelineBlock variant="transition">`. Transition-specific icon and midpoint divider are passed as children.
- Added `isDraggingTransitionLayer` variable.
- Added `"transition"` case to `selectTimelineItemAtTime` (click-to-select on timeline).
- Added transition row iteration to `timelineSelectionFromDrag` (box-selection).
- Added `transitionLayers` bucket to box-selection return type and `timelineSelectionKey`.
- Updated empty-selection guard from `"||"` to `"|||"` for 4 selection groups.
- Added bulk selection move support (`isSelectionMove`) to `updateTransitionFromPointer`.
- Added `clearTransitionResizePreviews` helper.
- Added `overflowVisible={isDraggingTransitionLayer}` to transition lane rendering.

### useTimelineClipboardCommands.ts
- Added `{ kind: "transition" }` to `TimelineNodeClipboard` type.
- Added transition props to `UseTimelineClipboardCommandsInput` and hook destructuring.
- Added `transitionLayers` to `SceneTimelineClipboardState`.
- Added transition handling to:
  - `getSelectedTimelineNodeClipboard` (copy from selection)
  - `getTimelineNodeClipboardForTarget` (copy from context menu - was returning `null`)
  - `deleteTimelineClipboardNodes` (delete via clipboard pipe)
  - `deleteSelectedTimelineNodes` (Backspace/Delete shortcut)
  - `pasteTimelineNodes` (paste with new IDs)
- Fixed `targetAlreadySelected` for transitions in context menu (was hardcoded `false`).
- Added `selectTransitionLayer()` call for transition targets in context menu.

### useTimelineSelectionCommands.ts
- Added `transitionLayers: Array<{ layerId: string }>` to `TimelineNodeSelection` type.
- Added `setSelectedTransitionLayers` to the input type and hook destructuring.
- `selectTimelineNodes` now also sets `selectedTransitionLayers` from the selection.

### useTimelineProjectActions.ts
- Added `updateSceneTransitionLayers` function, following the same pattern as `updateSceneAdjustmentLayers`.
- Added `TransitionLayer` to imports.

### editorStore.tsx
- Added `selectedTransitionLayerId: null` and `selectedTransitionLayers: []` to `clearNodeSelection`.

### timeline.ts
- Added `{ kind: "transition"; layer: TransitionLayer }` to `TopTimelineItem` type.
- Added `transitionLayers` parameter to `getTopTimelineItemAtTime` with transition hit-testing.
- Added `TransitionLayer` import.

### timelineTypes.ts
- Added `"transition"` to `EffectDragPreview.category` union.
- Added `transitionLayers` bucket to `onSelectTimelineNodes` prop signature.

### App.tsx
- Added `updateSceneTransitionLayers` destructured from `useTimelineProjectActions`.
- Added `setSelectedTransitionLayers` prop to `useTimelineSelectionCommands`.
- Added transition props (`selectedTransitionLayerId`, `selectedTransitionLayers`, `selectTransitionLayer`, `setSelectedTransitionLayerId`, `setSelectedTransitionLayers`, `updateSceneTransitionLayers`) to `useTimelineClipboardCommands`.

## Architecture Notes

- `TimelineBlock` is now the single rendering primitive for adjustments, motion markers, AND transitions. Variant-specific behavior (arrow icon, midpoint line) is passed as React children.
- The delete clipboard pipeline (`TimelineNodeClipboard` → `deleteTimelineClipboardNodes` → store update) now serves all three block types (adjustment, motion, transition).
- `deleteSelectedTimelineNodes` (triggered by Backspace) now checks `selectedTransitionLayers`/`selectedTransitionLayerId` alongside adjustments and motion markers.
- `clearNodeSelection` now clears transition selections.
- Box selection (`timelineSelectionFromDrag`) now includes transition rows.
- Click-to-select (`selectTimelineItemAtTime`) now recognizes transition layers.
- The `transitionLayers` data is already available on the scene object from `getSceneFromProject`, so no data plumbing was needed — only hook/wiring updates.

## Verification
- `npx tsc --noEmit` — clean
- `npx tsc -p tsconfig.node.json --noEmit` — clean
- `npx vitest run` — 102/102 tests pass

---

## 026b — Transition Drop/Resize/Snap Behavior Fixes

### Summary

Fixed 6 transition behavior issues: drop anchoring, preview/drop duration mismatch, left resize midPoint jitter, midPoint snap during move, snap guide visibility during midPoint snap, and structural consistency during resize.

### Changes

#### Drop Anchoring (App.tsx + DirectTimelinePanel.tsx)
- `addTransitionLayerAt` in App.tsx: Changed from `start = sceneTime - midPoint` (centered) to `start = sceneTime` (left edge at drop point). Transitions now drop the same way other markers do.
- `getEffectPreviewBase` in DirectTimelinePanel.tsx: Changed transition preview from centered (`sceneTime - duration/2`) to left-edge-at-drop-point (`sceneTime`). Changed category from `"adjustment"` to `"transition"`.
- Updated both HTML5 and pointer drag-drop handlers to check for `category === "transition"` instead of `category === "adjustment"`.

#### Preview Duration Mismatch (DirectTimelinePanel.tsx)
- `getEffectPreviewBase` for transitions now uses `transitionEffect?.defaultDuration` (2s for swipe) instead of `defaultNewMarkerDurationSeconds` (3s). Preview ghost now matches the actual created transition size.

#### Left Resize midPoint Jitter (DirectTimelinePanel.tsx)
- `previewMapFromBlocks` now includes `midPoint` from the block if present. Previously only `start` and `duration` were captured, causing the midPoint to fall back to the stale original value during preview — creating visual jitter on left resize.

#### MidPoint Snap During Move (DirectTimelinePanel.tsx)
- Added midPoint snapping to transition move: when shift is held, the transition's midPoint snaps to boundaries (other marker edges, playhead, other transition midPoints). Previously only left/right edges snapped during move.
- Snap moves the entire transition so its midPoint aligns with the boundary.

#### Snap Guide Visibility During MidPoint Snap (DirectTimelinePanel.tsx)
- Added `transformSnapGuide` callback to `BlockInteractionConfig`. This allows `transformTiming` to override the snap guide time shown to the user.
- `startBlockPointerInteraction` now uses `config.transformSnapGuide?.(timing, result) ?? timing.guideTime` to update the snap guide.
- For transitions, `transformSnapGuide` returns the midPoint snap time when midPoint snapped, so the white guide line appears at the correct position.
- Previously the white line only showed edge snaps, not midPoint snaps.

#### Right Resize midPoint Structural Consistency (DirectTimelinePanel.tsx)
- Both "start" and "end" resize paths now clamp `midPoint` to `duration - minDuration` after snap. This prevents midPoint from exceeding the block's duration when the midPoint snap overrides it to a position that would break structural consistency.

### Files Changed
- `src/App.tsx` — `addTransitionLayerAt` drop anchoring
- `src/components/timeline/DirectTimelinePanel.tsx` — preview, previewMapFromBlocks, transformTiming, transformSnapGuide, BlockInteractionConfig, drop handlers

---

## 026c — Left Resize Jitter Fix + Overlap Blocking

### Summary

Fixed the left resize right-edge jitter caused by independent rounding of start and duration. Added parametric overlap blocking for transitions with red preview.

### Left Resize Jitter Fix

**Root cause**: In the "start" action of `transformTiming`, both `start` and `duration` were independently rounded (`roundTenth`). The right edge `start + duration` did not equal the fixed `totalEnd` because `roundTenth(x) + roundTenth(totalEnd - x) ≠ totalEnd` in general. This caused the right edge to oscillate by up to 0.1s.

**Fix**: For "start" action, derive `duration` from the already-rounded `start` and the fixed `totalEnd`: `duration = totalEnd - start`. This ensures the right edge is perfectly stable. Same pattern applied to "end" action for symmetry.

**Files**: `DirectTimelinePanel.tsx` `transformTiming` function.

### Overlap Blocking

**Changes**:

1. **`EffectManifestTag`** (`src/core/types.ts`): Added `"blocksOverlap"` tag.
2. **`EffectDragPreview`** (`src/components/timeline/timelineTypes.ts`): Added `blocked?: boolean` field.
3. **Swipe manifest** (`src/core/effects/builtins/transitions/swipe/manifest.yml`): Added `tags: ["blocksOverlap"]`.
4. **`isTransitionBlocked`** (`DirectTimelinePanel.tsx`): New function that checks if a transition preview range overlaps any existing transition on the same row, but only if the effect has the `blocksOverlap` tag.
5. **`previewTransitionEffectDrop`**: Now computes `blocked` and includes it in the preview.
6. **`dropTransitionEffect`** (HTML5 drop): Blocks the drop when `blocked` is true.
7. **Pointer drag drop handler**: Checks `effectDragPreviewRef.current.blocked` and skips `onAddTransitionEffect` when blocked.
8. **`EffectDragPreviewBlock`** (`TimelinePrimitives.tsx`): When `preview.blocked` is true, overrides the gradient to red (`#dc2626` → `#991b1b`).

**Parametric**: The overlap blocking is controlled by the `blocksOverlap` tag on the effect manifest. Effects without this tag allow overlapping drops. To enable for a new transition, add `tags: ["blocksOverlap"]` to its `manifest.yml`.

**Move blocking**: The same overlap detection applies when moving existing transitions within the timeline. Both single-move (via `startBlockPointerInteraction`'s `isBlocked` callback) and bulk-move paths check for overlaps. The transition block is visually dimmed when blocked, and the commit is rejected.

### Verification
- `npx tsc --noEmit` — clean
- `npx tsc -p tsconfig.node.json --noEmit` — clean
- `npx vitest run` — 102/102 tests pass

---

## 026e — Resize + Move Blocked Red Preview Consistency

### Summary

Made blocked transitions turn red consistently across all drag interactions: external drop, single-item move, bulk move, and resize.

### What was already working
- **External drop**: `EffectDragPreviewBlock` already rendered red when `blocked=true`
- **Single-item move**: `applyTimelineBlockPreview` already turned the element red when `blocked=true`
- **Bulk move**: `applyTimelineBlockPreview` already turned elements red when `blocked=true`

### What was missing
- **Resize preview**: resize used `previewTimelineBlocks` (React state) instead of `applyTimelineBlockPreview`, so there was no mechanism to show red during resize when overlap would occur.

### Changes

1. **`TimelineBlockPreview`** (`timelineBlockPreview.ts`): added `blocked?: boolean` field.
2. **`previewMapFromBlocks`** (`DirectTimelinePanel.tsx`): now copies `blocked` from block to preview entry when present.
3. **`TimelineBlock`** (`TimelinePrimitives.tsx`): added `blocked?: boolean` prop. When true, uses the red gradient (`#dc2626 → #991b1b`) instead of the effect's gradient.
4. **`startBlockPointerInteraction` resize path**: compute `blocked` via `config.isBlocked` and pass it through the preview map so the rendered block turns red.
5. **Transition rendering** (`DirectTimelinePanel.tsx`): passes `blocked` from preview layer to `TimelineBlock`.

### Behavior
- When dragging a transition that would overlap another (and `blocksOverlap` tag is set):
  - **Drop**: red preview ghost
  - **Move**: element turns red via CSS transform preview
  - **Resize**: element turns red via React preview map
  - **Commit**: blocked — no state change

### Files Changed
- `src/components/timeline/timelineBlockPreview.ts`
- `src/components/timeline/TimelinePrimitives.tsx`
- `src/components/timeline/DirectTimelinePanel.tsx`

### Verification
- `npx tsc --noEmit` — clean
- `npx vitest run` — 102/102 tests pass

---

## 026d — Shift+Resize midPoint Anchor Jitter Fix

### Summary

Fixed jitter when holding shift and resizing transitions. The midPoint anchor now stays perfectly stable during both left and right resize with shift held.

### Root Cause

For shift-active resize, `start` was rounded independently, then `inDuration = midPointAbs - roundedStart` was computed. Due to rounding, `start + midPoint ≠ midPointAbs` exactly, causing the anchor to oscillate.

### Fix

For both "start" and "end" actions with shift active:
1. Compute the raw duration from the unrounded `start`
2. Round the duration: `inDuration = r(rawInDuration)`
3. Derive `start` from the anchor: `start = midPointAbs - inDuration`
4. `duration = inDuration * 2`

This pins `midPointAbs` as the immovable anchor. `start + midPoint = midPointAbs` exactly because `start` is derived from `midPointAbs` and the rounded `inDuration`, and `midPoint = r(inDuration)`.

Also removed the no-op `start = midPointAbs - (midPointAbs - start)` that was in the old shift-active path.

### Files Changed
- `DirectTimelinePanel.tsx` — `transformTiming` function, both "start" and "end" shift-active paths

### Files Changed
- `src/core/types.ts` — `EffectManifestTag` added `"blocksOverlap"`
- `src/core/timelineLayers.ts` — `applyTimelineBlockPreview` and `clearTimelineBlockPreview` support `blocked` styling
- `src/core/effects/builtins/transitions/swipe/manifest.yml` — added `tags: ["blocksOverlap"]`
- `src/components/timeline/timelineTypes.ts` — `EffectDragPreview.blocked` field
- `src/components/timeline/TimelinePrimitives.tsx` — `EffectDragPreviewBlock` red gradient when blocked
- `src/components/timeline/DirectTimelinePanel.tsx` — `isTransitionBlocked`, `isBlocked` on `BlockInteractionConfig`, move/drop blocking, `previewTransitionEffectDrop` blocked state
