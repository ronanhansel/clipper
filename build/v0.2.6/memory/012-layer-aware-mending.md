# Layer-Aware Mending

## Status

Fixed a mending regression caused by multi-row motion layers.

## Implemented

- Scoped middle mend candidate detection to each marker's motion layer instead of sorting all markers of a kind together.
- Added shared zoom and translation layer-id helpers in `src/core/timeline.ts`; translation uses pan/rotate fallback layer ids because pan and rotate markers share `translationMarkers`.
- Updated derived editor state and mend commands in `src/App.tsx` to use those layer resolvers.
- Scoped mended zoom focus normalization and mended focus-group lookup to zoom layers so unrelated zoom rows do not break or inherit a mended chain.
- Added a regression test proving same-layer zoom markers can mend even when another layer has an interleaving marker.
- Tightened mend grouping to use effect-kind keys, so pan and rotate cannot mend or drag as one chain even if they accidentally share a layer id. Zoom mending remains isolated to zoom markers.
- Pan mended handoffs now use the previous pan marker's own stored position instead of resolving the previous marker's tracker, so mended pans do not inherit tracker targets from each other.

## Architecture Notes

- The core middle-snap helpers now accept an optional layer resolver while preserving the previous default grouping for callers that do not use motion layers.
- Reuse `getZoomMarkerMendKey` and `getTranslationMarkerMendKey` for future timeline operations that need marker adjacency; do not compare raw array order when motion layers are visible.
