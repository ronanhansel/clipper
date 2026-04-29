# Single Selected Block Mending

## Status

Fixed a timeline mending regression where selecting one motion block no longer exposed a mend candidate unless the playhead was also positioned in the gap.

## Implemented

- `getSelectedZoomMiddleSnap` now handles a single selected marker by checking same-layer adjacent markers before falling back to playhead-based mending in the UI.
- The helper still uses the existing layer-aware mend resolver, so zoom, pan, rotate, and perspective blocks only mend with compatible neighbors.
- Added a core regression test covering a single selected block mending with its previous neighbor.
- Updated zoom and translation mend writes to go through `withMotionMarkers`, preserving the canonical `motionBlocks` list instead of only mutating derived marker arrays.
- Added a regression test proving a single selected pan/rotate neighbor does not produce a mend candidate even if both blocks share a layer id.
- The left Effects panel Mend button now dispatches to the selected motion kind, or to a same-kind playhead candidate when nothing is selected; it no longer behaves as zoom-only UI.

## Architecture Notes

- The fix stays in `src/core/timeline.ts` so both inspector-derived state and App mend commands reuse the same behavior without adding UI-specific special cases.
