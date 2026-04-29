## Cross-Composition Motion Mends

Goal: allow motion nodes to mend across adjacent compositions on the timeline and move behavior toward the timeline-master model.

Implementation notes:
- Mend detection for selected inspector/tool actions operates in absolute scene time, using timeline part start offsets, so composition boundaries do not break motion handoffs.
- Timeline drag grouping should also follow mended chains across composition boundaries so a mended handoff behaves as one motion chain during moves.
- Reuse the existing `snapIn`/`snapOut` marker flags; no new persisted schema is required.
- Current persistence still stores motion markers on composition entries. Future timeline-master work should promote timeline elements into a first-class sequence of blocks, where compositions, motion, and effects are peers on the timeline.

Timeline-master update:
- Composition clips now carry explicit `start` and `layerId` fields in timeline scene entries.
- `buildLinearTimeline` preserves explicit starts and overlap; legacy clips without starts still fall back to linear placement.
- Timeline layer state now has `compositionLayers`, with a default `comp` row retained for legacy projects.
- The timeline UI renders composition rows like other marker lanes. Composition clips can be moved between comp rows, resized from either edge, overlapped, and added multiple times from the library as separate clip instances that reference the source composition via `compositionId`.
- Layer row operations and block preview cleanup are shared in `src/core/timelineLayers.ts`. Composition, adjustment, and motion rows should use those helpers for add/move/rename/hide/remove and vertical row drag previews instead of adding category-specific logic.
- Composition vertical layer drag clipping was fixed by sharing drag-active category state in `TimelinePanel` and by having `applyTimelineBlockPreview` temporarily lift the dragged block parent lane overflow. Do not add comp-only overflow workarounds; route future block previews through `src/core/timelineLayers.ts`.
- Timeline lane rows now measure the scroll viewport and add any spare vertical height to the last visible row, with panel bottom padding removed, so short timelines use the full panel height instead of leaving dead space at the bottom.
- Motion block mends are now explicit via `mendInId`/`mendOutId`. `snapIn`/`snapOut` alone only marks edges and must not create mended drag/resize/focus groups, square joined corners, or active middle-transition controls unless the explicit counterpart IDs are present and adjacent.
