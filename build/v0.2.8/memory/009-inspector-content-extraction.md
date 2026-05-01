# Inspector Content Extraction

Extracted the dense right inspector content conditional from `src/App.tsx` into `src/app/shell/ConnectedInspectorContent.tsx`.

## Architecture Notes

- `RightInspectorPanel` still owns the outer inspector panel, tabs, `data-inspector-panel`, validation rendering, and panel styling.
- `ConnectedInspectorContent` owns the selected inspector priority order: Agent, zoom marker, translation marker, chart object, generic object, adjustment layer, selected frame, then empty state.
- The extraction is intentionally prop-heavy so `App.tsx` keeps deriving editor/project state while the shell component handles only inspector selection and callback binding.
- Zoom, translation, adjustment point picking, chart/object edits, frame edits, AgentPanel, and scale-preview callbacks are passed through without changing behavior.

## Reuse Guidance

- Add future right-inspector selection branches in `ConnectedInspectorContent` instead of rebuilding nested conditionals in `App.tsx`.
- Keep validation and `data-inspector-panel` behavior in `RightInspectorPanel` unless the outer panel itself is refactored.
