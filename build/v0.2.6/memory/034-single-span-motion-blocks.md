## Single-Span Motion Blocks

- Removed cross-composition auto-splitting for motion blocks. Moves, resizes, effect drops, and paste now commit each motion block as one marker on a single owning composition, matching adjustment block behavior.
- A motion block may have a relative `start` outside its owning composition when it spans composition boundaries. Timeline rendering already uses `timelinePart.start + marker.start`, so the visual block stays scene-absolute.
- Preview now builds a scene-motion part in `src/app/state/editorDerivedState.ts` by normalizing all scene motion markers into the active composition's local time. This keeps a single spanning block active during playback even after the playhead enters another composition.
- Timeline hit-testing in `src/core/timeline.ts` now checks scene-wide motion markers instead of only the active composition, so selecting a spanning motion block works anywhere along its visible duration.
- `TimelineBlock` remains the shared block component for adjustment, zoom, and translation-family blocks; future block types should reuse it and avoid reintroducing per-kind block DOM.

Architecture note: marker persistence is now closer to adjustment layers: one logical block spans scene time and rendering derives its scene position from the owning composition. The legacy `splitMarkerAcrossTimelineRanges` helper remains in `src/core/timelineOverwrite.ts` for overwrite trimming, but motion placement should use single-block placement instead of cross-composition segmentation.
