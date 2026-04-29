# Effect Card Square Hover

## Goal
- Remove the rounded hover shape from individual effect cards in the Effects panel.

## Implemented
- Removed the `rounded-[7px]` utility from `effectButtonClass` in `src/components/ToolsPanel.tsx`.
- Folder rows retain their existing rounded treatment; only draggable effect cards were changed.
