# 011 Timeline Selection Ring

## Context

- User reported that the blue selected-part highlight appeared clipped by the inner orange/yellow clip fill.
- The selected part previously used an inset outline on the same button element as the clip fill.

## Work Log

- Changed the parts track from `overflow-hidden` to `overflow-visible` so the selected ring can render outside the clip fill.
- Replaced the inset outline with an absolutely positioned `after` pseudo-element using a negative inset and blue border.
- Added explicit left/right rounding to the first and last timeline part buttons so the track shape remains rounded without relying on overflow clipping.
- Updated the selected ring so only selections at the timeline start/end have rounded outer corners; interior selected parts remain square at their boundaries.

## Verification

- `npm run typecheck` passes.
