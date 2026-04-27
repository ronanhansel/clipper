# 005 Timeline Interactions

## Context

- User reported that timeline transport buttons were non-functional and the blue range scroller was unintuitive.
- User requested a vertical playhead, scene-wide scrubbing across parts, draggable part reordering, and draggable zoom timing/duration constrained within each part.
- User also requested design guidance to require `lucide-react` icons and shadcn base files for missing UI primitives.

## Work Log

- Added `lucide-react` and replaced text transport controls with Lucide icons.
- Moved preview state from part-local time to scene-level time, deriving the active part and part-local preview time from the playhead position.
- Wired transport controls: jump to start, step backward, play/pause, jump to next part, cut placeholder, and replay.
- Added Space keyboard shortcut to toggle playback unless focus is inside an input, textarea, select, or contenteditable field.
- Removed the range input scroller from the timeline and added click/drag scrubbing on the timeline surface with a vertical playhead line and head marker.
- Added native drag/drop part reordering in the parts row.
- Added pointer dragging for zoom markers: center drag moves the marker within its containing part, while edge handles resize start/end duration without crossing part boundaries.
- Updated `DESIGN.md` implementation rules for Lucide icons, shadcn primitives, and Tailwind utilities.

## Verification

- `npm run typecheck` passes after implementation.
- `npm test` passes.
- `npm run build` passes.
