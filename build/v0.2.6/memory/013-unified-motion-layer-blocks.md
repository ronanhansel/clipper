# Unified Motion Layer Blocks

## Status

Implemented a focused fix so motion blocks are movable across all motion layers, including layers already containing a different motion kind.

## Implemented

- Relaxed motion block drag/drop targeting in `src/components/timeline/TimelinePanel.tsx` so any motion layer can accept pan, zoom, or rotate blocks.
- Replaced kind-specific motion row rendering with a unified motion lane renderer that displays zoom and translation-backed blocks on the same row by `layerId`.
- Preserved existing marker identity, resize handles, selection styles, and rAF drag preview path; only the layer acceptance/rendering model changed.
- Verified with `npm run typecheck`.

## Architecture Notes

- Motion layer rows are now visual lanes, not type-exclusive containers. The marker's own collection still determines its behavior, while `layerId` determines which row renders it.
- Existing layer `kind` values remain useful for empty/default layer metadata and add-effect behavior, but occupied rows should not use `kind` as a hard compatibility gate.
