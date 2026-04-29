# Effect List Hover Inset

- Updated `src/components/ToolsPanel.tsx` so effect package lists include `pt-px` inside the scrollable list container.
- The effect buttons already lift with `hover:-translate-y-px`; the top item was clipped because the scroll viewport uses `overflow-y-auto`.
- Keep future effect-list hover treatments inside the list viewport padding rather than removing scroll clipping from the panel.
- Updated built-in motion presets (`Zoom`, `Pan`, `Rotate`, `Perspective`) to use the default blue motion gradient and blue drag preview color.
