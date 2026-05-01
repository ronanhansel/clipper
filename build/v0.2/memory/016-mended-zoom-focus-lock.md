# 016 Mended Zoom Focus Lock

## Summary
- Renamed visible middle snap terminology to Mend/Unmend in the tools panel and inspectors.
- Zooms joined by a mend now share the same focus when the mend is created.
- Focus X/Y fields and frame focus picking are disabled for mended zoom markers; users must unmend before editing focus.
- Active mends can be unmended from any selected marker in the mended pair/chain.
- Timeline marker joined edges render with green handles to indicate mended borders.
- Inspector and select popover clicks are excluded from global outside-frame selection clearing so marker selections persist while editing.

## Implementation Notes
- `snapZoomMiddle` copies the previous zoom marker focus across every zoom marker in the created mend group.
- `isZoomMarkerMended` detects active adjacent mends via matching `snapOut`/`snapIn` edges and shared boundary times.
- `getSelectedActiveMiddleMend` finds active mends touching selected markers so the inspector can show `Unmend` even when only one marker is selected.
- `normalizeMendedZoomMarkerFocus` also normalizes loaded projects and snap flag edits so existing mended chains share one focus.
- `startZoomFocusPick`, frame-pick commit, and `ZoomInspector` all guard against focus edits on mended zoom markers.
