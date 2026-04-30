# Composition Drag/Drop Regression

## Issue

Dragging a composition from the File Manager to the timeline could show drag UI but dropping did nothing. Failed drops could also leave the source ghost visible longer than expected.

## Root Cause

Composition rows started Clipper's pointer-driven drag, but Arborist's native tree drag could take over because the pointer drag intentionally did not prevent default. When native drag won, the timeline's native drop handler had no `application/x-clipper-composition` payload, so it ignored the drop.

## Fix

- `src/components/FileManager.tsx` now sets `application/x-clipper-composition` and `text/plain` during native composition `dragstart`, so the existing timeline native drop path can add the composition even when Arborist owns the drag.
- Native composition `dragstart` cancels any active Clipper pointer drag so the custom source ghost does not linger behind the native drag preview.
- Composition pointer drags no longer pass `skipPreventDefault`; Clipper now owns the drag gesture the same way effect drags do, preventing Arborist's native tree DnD from stealing the timeline drop path before the pointer-driven `drop` event is emitted.
- File Manager composition rows now keep Arborist's row-level `dragHandle` intact. Nested handles conflicted with Arborist and prevented internal reorder/move.
- Native composition drags carry Clipper timeline metadata (`application/x-clipper-composition` plus duration/label/empty/source flags), and `DirectTimelinePanel` has window-level native `dragover/drop` handling for those payloads. This lets one Arborist-native drag support both File Manager reorder and timeline drop, depending on the drop target.
- Final correction: composition rows keep Arborist's row-level drag handle for internal File Manager reorder, but no longer add native timeline payloads. `UnifiedTreeDragPreview` returns `null` for composition rows while the cursor is inside File Manager. When native drag coordinates leave `[data-file-manager-panel]`, it starts a separate Clipper-owned fixed DOM ghost and emits `clipper:composition-pointer-drag` move/drop/cancel events. Re-entering File Manager cancels the Clipper external drag and leaves Arborist in charge.
- Flutter fix: composition File Manager drags no longer render a React Arborist preview. Native `dragover` is only used as the cursor stream that drives the separate Clipper external ghost after leaving File Manager.
- Stutter fix: the external composition drag bridge now rAF-throttles ghost movement and `clipper:composition-pointer-drag` move dispatches. Composition timeline previews also preserve their initial preview identity while moving, so React does not remount the preview block on every cursor update.
- Native drag image fix: composition rows now set a transparent native drag image during drag start. This prevents the browser/Arborist drag image from competing with the Clipper external ghost. The external ghost is hidden whenever the cursor is over the timeline panel, rather than toggling from preview active/inactive events, to avoid flicker across row gaps.
- Native DnD suppression: once a composition drag has left File Manager and the Clipper external ghost is active, File Manager now suppresses the underlying Arborist/browser `dragover` and `drop` with `preventDefault`, propagation stop, and `dropEffect` control. This keeps Code/Monaco and other panes from autoscrolling or accepting the native drag, matching effect drags where no browser DnD exists.
- External drop auto-scroll: effect drags and File Manager composition drags now feed the same timeline drag auto-scroll loop used by in-timeline marker moves. The loop supports horizontal and vertical edge scrolling and replays the external preview after scroll so drops can target offscreen rows/times.
- Auto-scroll sensitivity fix: vertical auto-scroll is opt-in and only runs when callers provide `clientY`. In-timeline pointer transactions now pass their real `clientY`; old horizontal-only calls no longer default to the top edge. The vertical edge band and speed are reduced to avoid scrolling just from picking up a block near the top.
- External snapping unification: adjustment effects, motion effects, and File Manager composition drops all use `getTimelineBlockTiming({ action: "move" })` with the universal boundary set (`getScrubSnapBoundaries(...)` plus playhead). This removed the ad-hoc `snapTimelineBlockStartToBoundary` repetitions and gives all external layer kinds the same Shift snap/white-guide behavior as in-timeline block moves.
- Native composition timeline fallback was removed. File Manager external timeline placement now uses only `clipper:composition-pointer-drag`, matching effect DnD ownership and avoiding duplicate native DnD behavior.
- Internal/external block snap cleanup: Direct timeline now has `getUniversalBlockSnapBoundaries`, which includes composition clip edges, adjustment layer edges, independent motion timeline marker edges, composition-local motion marker edges, and the playhead. In-timeline composition moves/resizes, in-timeline adjustment moves/resizes, and external effect/composition drops all use this shared boundary source so adjustment blocks snap to motion markers the same way motion markers snap to adjustment blocks.
- The white snap guide is only shown when Shift changes the preview start by snapping to a boundary. Holding Shift away from a boundary clears the guide, matching in-timeline block move behavior.
- Effect drops now use the same Shift snap-guide rule as composition drops for both adjustment and motion effects: show the white guide only when the Shift-modified preview actually snaps to a boundary, and clear it when the external preview is removed.
- The shared pointer-drag helper now defaults to a shorter 160ms pickup delay for effect/source drags.
- Holding Shift while dragging a composition onto the timeline enables the same block-start snapping used by timeline blocks, including current playhead snap boundaries, and now shows the white snap guide.
- `src/lib/pointerDrag.ts` now also listens for document-level `pointerup`, `pointercancel`, and `mouseup` cleanup. This mirrors the effect-pane cleanup behavior and removes custom ghosts immediately when a release is observable outside the normal window pointer path.
- File Manager external composition drags no longer hide the source ghost for the entire timeline panel. The ghost now listens to `clipper:composition-drag-preview` and hides only while the timeline composition preview block is active, matching effect drag/source ghost coordination and keeping the ghost stable while crossing non-target timeline space.

## Follow-up Name Persistence Fix

- Generated composition source now writes top-level `id` and `name` fields into `new Composition({ ... })`.
- The composition API and source loader now preserve `composition.name` from source.
- Zip source id detection now only reads a top-level `id` property instead of accidentally matching nested `background.id`, which caused reloaded new compositions to appear as `background`.

## Architecture Notes

- The timeline still owns placement via `DirectTimelinePanel.onAddComposition`; File Manager only supplies the source composition id for both pointer-driven and native DnD paths.
- Keep both paths supported because File Manager uses Arborist for internal tree moves while timeline drops use Clipper-specific payloads.
- Source ghost visibility should stay event-driven. Timeline preview ownership belongs in `DirectTimelinePanel`, while File Manager only mirrors the preview-active signal for its external drag ghost.
