## Shift Timeline Node Drag Snap

- Updated timeline zoom and translation marker move previews so pressing or releasing Shift during an active drag immediately reapplies the preview with the current snap state, even before the next pointer movement.
- Extended the same Shift snap behavior to zoom and translation marker resize handles. The resized edge snaps to the shared marker drag boundaries during preview and final commit.
- Expanded marker drag snap boundaries to include other zoom and translation marker edges, while excluding the same-kind markers currently being moved. Composition boundaries remain snap targets.
- Fixed the timeline playhead handle alignment by keeping its `translateX(-50%)` centering in the inline transform that also applies transient scrub movement, so the handle stays centered over the vertical playhead line.
- Replaced the split ruler/lane playhead rendering with a single absolute overlay under `playbackPlayheadRef`. The handle and line now share one content-width coordinate system and one `--clipper-timeline-scroll-x` transform, preventing offset growth while scrolling horizontally.
- Architecture note: reusable snap-boundary calculation lives in `src/core/timeline.ts` as `getTimelineMarkerDragSnapBoundaries`; `TimelinePanel` keeps the transient rAF drag preview and final commit behavior local to the pointer interaction.
