# Animated Graph Template

## Summary

- Added a sample project composition for an animated graph reveal in `clipper/projects/prj_v01_sample/scn_opening/prt_animated_graph.ts`.
- Registered the part in both `src/sampleProject.ts` and `clipper/projects/prj_v01_sample/project.json` so the bundled fallback and saved project load the same template.
- Extended `getObjectPreviewAnimation` in `src/App.tsx` for graph-specific line draw and ticking number previews keyed by `graph-line-*` and `graph-value-*` ids.

## Notes

- The graph template uses regular Clipper objects so axes, ticks, labels, lines, endpoint glows, and number readouts remain selectable/editable.
- The line reveal uses `scaleX` from the segment origin; value readouts count up according to each line's progress.
