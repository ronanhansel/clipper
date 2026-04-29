# Edit Page Interactions

Investigation started from a user report that objects on the Edit page cannot be edited or moved. Focus areas are the page-mode wiring, canvas/preview hit testing, selection state, and pointer handlers that commit canonical object transforms.

## Findings

- Frame object selection and dragging are gated by the top-level `mode === "interactive"` and `timelineMode === "edit"`.
- The timeline `Edit` button only changed `timelineMode`, so if the center pane was still in `Code`, object pointer handlers were unavailable.
- Derived preview state preferred the playhead composition over `selectedPartId`, which made Edit mode feel non-editable when the selected timeline clip was not the clip under the playhead.

## Implemented

- `updateTimelineMode("edit")` now also switches the top-level preview mode to `interactive` and persists that mode with the timeline-mode update.
- `useEditorDerivedState` now prioritizes the selected timeline part while in Edit mode, and keeps playhead-first behavior in Composition mode.

## Architecture Note

The fix stays at the state boundary instead of weakening pointer-handler guards. Frame interactions still require the explicit editable state (`interactive` + `edit`), while timeline-mode selection now ensures that state is reachable from the Edit page affordance.
