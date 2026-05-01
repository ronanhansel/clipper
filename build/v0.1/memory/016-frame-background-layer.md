# 016 Frame Background Layer

## Goal

Add editable frame/background properties when no object or zoom marker is selected, introduce a separate code-authored background layer behind frame objects, and include an animated dot template example.

## Notes

- Project version remains `v0.1`.
- Existing parts use `frame: { width, height }` and `objects: []`; the new fields should remain optional so current part files continue to load.
- The background layer should render behind objects and support the same simple motion track preview as objects.

## Implementation

- Added `PartFrame` and `BackgroundLayer` to `src/core/types.ts` and exposed matching optional fields in `clipper/projects/part-api.ts`.
- `src/core/partSource.ts` now loads optional `frame.style` and `background` code fields, defaulting to a dark frame and transparent background layer.
- `src/App.tsx` renders the background layer behind objects and shows a frame/background inspector whenever no object or zoom marker is selected.
- Added `prt_animated_dot` as a sample part template with a code-authored animated background dot.
- Added `background.elements` for constant/non-selectable background objects generated in part code. These render behind normal frame objects.
- `MotionTrack.loop` lets background and frame element motion repeat for the whole part preview.
- Updated `prt_animated_dot` to define reusable `dottedBackground` and `heroDot` constants in TypeScript and mount them through `background.elements`.

## Verification

- `npm run typecheck`
- `npm test`
