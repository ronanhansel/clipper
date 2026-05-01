# Drag interaction performance instructions

Expanded project agent instructions for high-frequency interactions.

- Updated `AGENTS.md` Architecture rules so drag, resize, scrub, marquee, slider, picker, and pointer-move interactions default to transient rAF previews instead of continuous app/project state writes.
- Instructions now explicitly prefer imperative DOM/CSS-variable previews such as `transform`, `translate3d`, width/height variables, and refs for high-frequency visual feedback.
- Canonical app/project state should be committed once on pointer up/cancel, release, blur, or another explicit finalization event.
- Any unavoidable live state updates should be throttled, deduplicated, and narrow.
- Existing behavior constraints such as snapping, clamping, no-overlap rules, selection semantics, and mended marker chains must remain preserved when optimizing previews.
