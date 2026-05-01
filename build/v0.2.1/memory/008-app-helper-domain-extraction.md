# App Helper Domain Extraction

## Context

- User reported that `src/App.tsx` was still spaghetti code with unrelated helpers mixed into the React shell.
- The requested direction was to colocate helper functions by domain, especially scrubbing and timeline logic alongside timeline functions.

## Implemented

- Moved timeline lookup, scrub snap boundaries, marker placement, marker drag grouping, marker move calculation, mended-marker selection, and marker resize-with-push helpers into `src/core/timeline.ts`.
- Added `src/core/camera.ts` for camera preview transforms and frame/camera point conversion helpers.
- Added `src/core/editorConstants.ts` for shared numeric interaction constants; `src/app/config.ts` re-exports them for existing UI imports.
- Added `src/core/frameInteraction.ts` for frame object selection payloads, selection bounds, object drag bounds, object resize bounds, marquee visibility, and transient drag-box DOM updates.
- Updated `src/App.tsx` to import these domain helpers instead of defining them inline.
- Kept DOM refs, React state, event handler orchestration, and UI rendering in `App.tsx` for now.

## Architecture Notes

- Timeline scrubbing and marker geometry now live in `src/core/timeline.ts` because they operate on `TimelinePart` arrays and are reusable by timeline UI, tests, and future services.
- Camera transform math lives in `src/core/camera.ts` because frame preview and runtime camera behavior should share a narrow transform vocabulary.
- Frame selection drag/resize math lives in `src/core/frameInteraction.ts`; React still owns the rAF scheduling and canonical state commits, while pure calculations are importable and testable.
- Core helper modules avoid importing `src/app/config.ts`; shared numeric constants now live under `src/core` and app-specific Tailwind/class tokens remain in `src/app/config.ts`.
- Future extraction should split large presentational regions (`TimelinePanel`, `FramePreview`, inspectors, settings) out of `App.tsx` after the helper seams are stable.

## Verification

- `npm run typecheck` passes.
