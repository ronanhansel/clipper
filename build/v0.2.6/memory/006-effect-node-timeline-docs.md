# Effect Node Timeline Docs

## Status

Added documentation for implementing new effect nodes and keeping timeline interactions independent and consistent.

## Implemented

- Created `docs/EFFECT_NODES_AND_TIMELINE_INTERACTIONS.md`.
- Documented current effect families: composition blocks, adjustment layers, zoom markers, and pan/rotate translation markers.
- Captured best practices for layer independence, drag/resize previews, snapping, overlays, state boundaries, and common failure modes.

## Architecture Notes

- The docs codify the current v0.2.6 timeline interaction model: pure math in `src/core`, local rAF/DOM previews in `TimelinePanel`, and canonical project mutation through semantic app callbacks.
- Future effect nodes should reuse the same lane identity pattern (`layerId` for motion effects) and keep move/resize constraints scoped to the target lane.
