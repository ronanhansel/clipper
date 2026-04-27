# 024 Zoom Snap Middle

## Context

- User requested a contextual Snap Middle control when the playhead sits between two zoom markers.
- Goal is to quickly align neighboring zoom edges at the playhead and create an abrupt jump between zooms.

## Work Log

- Added gap detection for the active part when the playhead is between a previous and next zoom marker.
- Added contextual Snap Middle buttons in the Tools panel and top frame controls.
- Added Snap Middle to the zoom inspector when the selected zoom participates in a middle snap opportunity.
- Replaced the zoom inspector Snap In/Snap Out checkboxes with active-state buttons and placed Snap Middle between them.
- Updated the inspector snap controls to a `Snap` section with `In`, `Middle`, and `Out` buttons.
- Added zoom-row marquee selection by dragging over zoom blocks.
- Enabled Middle when the marquee selection includes adjacent zoom markers, using the midpoint between their neighboring edges as the snap point.
- Changed Middle so it is enabled/disabled but no longer auto-highlighted as active.
- Multi-selected adjacent zoom chains hide In/Out and let Middle snap every internal adjacent edge.
- Multi-selected non-adjacent zooms grey out Middle and keep In/Out available for bulk snap-in/snap-out updates.
- Snap Middle moves the previous zoom's end and next zoom's start to the playhead.
- Snap Middle enables `snapOut` on the previous zoom and `snapIn` on the next zoom to make the transition abrupt.
- Relaxed gap detection so Snap Middle appears when the playhead is exactly on a join between adjacent zooms, not only strictly inside an open gap.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.
- `npm run typecheck` passes after boundary-tolerant detection update.
- `npm test` passes after boundary-tolerant detection update.
- `npm run typecheck` passes after inspector button layout update.
- `npm test` passes after inspector button layout update.
- `npm run typecheck` passes after marquee-selection snap update.
- `npm test` passes after marquee-selection snap update.
- `npm test` passes after multi-selection snap-state update.
- `npm run typecheck` is blocked by unrelated incomplete translation-marker code in `src/App.tsx` (`getActiveTranslation`, `normalizeProject`, `TranslationInspector`, and related helpers are missing or mismatched).
