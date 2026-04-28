# Graph Interface Demo Slide

## Summary
- Added `Slide 04 - Thin Line Graph` to the current white serif demo project.
- The new composition lives at `clipper/projects/prj_white_serif_demo/scn_white_serif_demo/prt_graph_interfaces.ts` and is registered in `project.json` as `prt_graph_interfaces`.
- The slide now demonstrates a warm white editorial graph interface with a small header, large thin-line chart, numeric labels, and no decorative chart artifacts.
- Added an external project reload improvement so new externally added compositions can be auto-merged into a dirty in-memory project instead of always requiring the manual Refresh button.

## Architecture Note
- The slide follows the component-oriented TypeScript authoring pattern: named `Component` classes feed a top-level `Composition` render method.
- The latest slide rendering uses hand-directed `Svg`, `Rect`, and `Text` objects instead of the generated `Chart` object path, because this specific demo needs precise thin line weight and must avoid generated value cards, chunky point marks, and other chart artifacts.
- The graph line now uses a non-static `Template` object that computes a partial polyline from playback time, producing a true tracing animation instead of scaling a completed SVG line.
- The manifest includes the first-class chart objects and surrounding UI chrome so the slide appears correctly when opened from the project manifest before source edits are applied.
- The redesign intentionally matches the prior white serif slides while removing the oversized title and ornamental seal/orbit elements: `#fbfaf6` background, Avenir/Gill Sans metadata, ochre accent line, fine rules, and restrained editorial staging.
- External reload handling now compares the changed project on disk against the last saved project snapshot. If the only project-content delta is newly added compositions in existing scenes, those compositions and their sources are merged into the current project while preserving unsaved local edits and the current editor state.
- Chart objects are treated as preview-time-sensitive in `FramePreview`, because their generated child marks carry animation even when the top-level chart object has no direct `motion` track. Without this, playback could render the chart once at time 0 and keep the animated marks blank.

## Reuse Guidance
- Reuse `Chart` objects for future graph/UI demos rather than embedding static SVG charts.
- Keep chart styling local to highly art-directed slides unless several slides need a shared graph theme.
- Keep the additive merge path conservative. It should continue to fall back to manual Refresh for changed existing compositions, changed source files, scene metadata edits, asset edits, or any project-level change that could overwrite local work.
