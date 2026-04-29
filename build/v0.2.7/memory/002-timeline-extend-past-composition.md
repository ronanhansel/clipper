## Timeline Extend Past Composition

Timeline blocks should be allowed to add, move, and resize past the current composition end. The timeline's total duration is derived from all timeline content, not only composition clip ends.

Architecture note: duration derivation lives in `src/core/timeline.ts` so playback, export, validation, and UI width share the same model. Pointer/drop affordances remain in `TimelinePanel`, while committed project mutations stay in `App.tsx`.

Use this pattern for future timeline work: any timeline node with an absolute start and duration should contribute to total scene duration, and movement should clamp only against zero and the visible timeline tail unless a storage model has a stricter requirement.

Mended motion marker resize semantics were tightened after repeated-resize instability. `resizeTimelineMarkersWithPush` in `src/core/timeline.ts` now derives the full explicit mend chain from reciprocal mend links and treats that chain as a block. Internal seam resize attempts are no-ops; only the first marker's left edge and the last marker's right edge resize the chain. This should remain true until an explicit unmend action removes the reciprocal mend references.

Important interaction detail: even when a full mended chain is selected after moving, resizing any edge in that chain must not use generic multi-selection resize. `TimelinePanel` intentionally narrows mended-chain resize targets to the grabbed marker; the core resize helper then validates whether that marker is the chain's outer edge before changing bounds. This prevents a left-edge resize from also resizing selected downstream markers and pulling the seam/right edge apart.

Mended seam rendering was de-duplicated in `TimelinePanel`. Only the previous marker's right edge draws the visual mended seam. Internal seam resize hit zones are disabled, so pointer interaction on a mended interior falls through to the block move path. The save path protects all IDs in an explicit mended chain during overwrite trimming via `expandExplicitTimelineMarkerMendIds`, without hidden timing normalization.

Explicit mend references are now the source of truth for whether a seam is mended. `isExplicitTimelineMarkerMend` and `src/core/markers.ts` no longer require `previous.start + previous.duration` to equal `next.start` because rounding or resize drift could otherwise turn an explicitly linked seam pink without an explicit unmend action. Timing contiguity can still matter for layout quality, but it must not be used to decide whether a reciprocal mend link is active.

Inner mended seams are resizable again. The UI leaves resize handles active on mended edges, and `resizeTimelineMarkersWithPush` handles an internal seam by resizing the marker on one side while shifting/resizing the reciprocal neighbor on the other side. Outer edge resizing still only changes the outermost marker in the explicit chain. The important invariant is that seam resize may change adjacent starts/durations, but it must preserve reciprocal `mendInId`/`mendOutId` metadata so the seam remains cyan/mended.

Internal seam resize also preserves any existing timing drift between explicitly linked markers. Since explicit links can remain active even when `previous.end !== next.start`, resize must not silently close that offset on the first drag; closing it caused a visible slight shift. For right-edge seam resize, the following marker keeps its existing `next.start - previous.end` offset. For left-edge seam resize, the previous marker's end is adjusted with the same offset preserved. This keeps old/project data visually stable while still allowing the seam to resize.

Mended internal edges should not show a dark divider. `TimelineBlock` now builds its inset edge shadow per side: squared mended left/right edges omit the corresponding dark inset shadow, while exposed outer edges keep the shadow. This removes the small black seam/border between visually mended markers without changing resize handles or mend metadata.

Left-edge resize must keep the opposite edge absolutely fixed. `resizeTimelineMarkersWithPush` now rounds the moving `start` first and derives `duration` from the original fixed end, instead of rounding start and duration independently from the raw pointer time. This prevents subtle seam jitter where `start + duration` could drift by 0.01s during preview/commit when resizing the leftmost marker of a mended chain.

The leftmost marker of a mended chain must also clamp against its own fixed right edge, not the whole chain end. A previous version used `chainEnd - minimumZoomDuration`, which allowed dragging the left edge past the first marker's internal seam and could create invalid/negative first-marker duration before commit. That manifested as severe preview overlap and the seam snapping out of mend. The clamp is now `firstMarker.end - minimumZoomDuration`, with a regression test covering an excessive rightward left-edge drag.

Removing a motion layer must remove its markers, not just the row. `removeMotionLayer` now always runs `removeTimelineMotionLayerMarkers` for the active scene instead of depending on a pre-check before filtering. The marker removal helper also handles legacy/default markers without explicit `layerId` by matching their effect kind to default layer IDs such as `clipper.motion.perspective`. This prevents deleted non-empty rows from being regenerated by `getTimelineMotionLayersWithMarkers` as a generic "Motion" row containing the supposedly deleted markers.

Motion layer deletion must be WYSIWYG. The row count and removal target now use the same `motionLayers` array rendered by the timeline, including any rows recovered from marker data, then persist the post-delete visible row list back to `editorState.timelineLayers.motionLayers`. Do not gate deletion on `getTimelineStateLayers(...)` alone because stale editor state can say there is only one motion layer while the timeline visibly renders more recovered rows. Marker membership checks use `isMotionMarkerOnLayerId`, the same legacy/default-aware matching used by removal.

Recovered motion rows from marker data were removed from the live timeline path. `App` and `TimelinePanel` now render motion rows directly from `editorState.timelineLayers.motionLayers` (or initial defaults only when the state has no rows), and `getTimelineMotionLayersWithMarkers` no longer synthesizes missing rows named `Motion`. This is the WYSIWYG rule: the persisted timeline rows are the source of truth; marker data must not recreate deleted rows or swap their labels/order after deletion.

Timeline deletion no longer enforces arbitrary minimum content. Users can delete all composition clips, adjustment layers/effects, and motion layers/markers. When deleting the final row of a category, the app clears that category's content and leaves exactly one blank row so the timeline remains usable: `Composition` (`comp`), `Adjust` (`adjust`), and `Motion` (`motion`, `kind: "empty"`). The default comp label is now `Composition`, and new comp rows use `New Composition`. Do not reintroduce "timeline needs at least one ..." guards for these deletion paths.

Empty timelines must remain empty through normalization. `getProjectTimelines` now always syncs timelines from runtime scenes, even when every scene has zero compositions, so deleting the final timeline composition does not restore stale clips from the saved timeline document. Users can drag compositions back from the File Manager later.

New timeline creation must also start blank. `App.createTimeline` persists `clips: []`, empty adjustment layers, and empty scene-level motion arrays. Do not seed new timelines from `compositionLibrary[0]`; that makes every new timeline inherit an unrelated composition.

File Manager timeline rows display `timeline.name` directly. Do not append a UI-only `.timeline` suffix to the label or drag preview; the backing file path can still use `.timeline.json`.

Layer menus hide impossible move actions instead of showing disabled rows. Topmost rows do not show `Move up`, bottommost rows do not show `Move down`, and a single-row category shows neither move action.

Effects and composition assets now share a pointer-driven drag helper in `src/lib/pointerDrag.ts`. Effects emit `clipper:effect-pointer-drag`; compositions from the File Manager emit `clipper:composition-pointer-drag`. `TimelinePanel` listens for both, which avoids native browser drag ghost lag and lets blank Composition rows accept dropped compositions just like blank Adjust rows accept adjustment effects. Keep future timeline external drags on this helper rather than adding separate native DnD ghost lifecycles.

Composition asset drags now render a timeline preview block before drop, using the same preview machinery as adjustment/motion effect drags. Composition add/remove no longer emits success toasts; it behaves like marker operations.

Motion is being decoupled from composition clips. `Scene` now has first-class `zoomMarkers` and `translationMarkers`, and `buildLinearTimeline` exposes them through a synthetic `sceneMotionPartId` timeline part so motion rows can render even when there are no composition clips. Project save/load no longer strips `zoomMarkers`/`translationMarkers` as legacy data; scene-level motion markers are current model data. Avoid adding legacy/default fallback recovery paths.
