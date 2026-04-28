# Built-In Chart Generator

## Summary

- Added a Clipper-native `defineChart` helper to `@clipper/part-api` so composition sources can generate editable chart marks from declarative specs.
- The evaluator in `src/core/partSource.ts` injects `defineChart` alongside `definePart`, allowing code-pane sources to call it after imports are stripped.
- Chart support is intentionally dependency-free for now and covers common chart families through generated `rect`, `text`, and `svg` objects.

## Supported Types

- `line`, `area`, `bar`, `horizontalBar`, `groupedBar`, `stackedBar`, `scatter`, `bubble`, `pie`, `donut`, `radar`, `radialBar`, `gauge`, `heatmap`, and `waterfall`.

## Notes

- Cartesian charts can emit axes, grid lines, ticks, labels, points, and value readouts as separate Clipper objects.
- Curved or polar charts emit SVG mark objects for wedges, polygons, arcs, and paths while retaining generated ids and names for animation hooks.
