# Motion Ease Dropdown Dedup

## Summary

- Removed the duplicate `Ease in-out` row from translation motion ease dropdowns.
- The selected value now treats explicit `easeInOut` the same as the implicit default option, preserving existing marker data while showing one menu item.
- Added hover tooltips for each ease option that show a looping motion rail and sampled curve graph.
- Tuned the preview tooltip to open only after a 1s hover, sit farther from the select content, use a smaller radius, and draw smoother curves with denser floating-point samples.

## Architecture Note

The normalization and preview UI live in `src/components/inspector/InspectorPanels.tsx` beside the inspector dropdowns because this is display-state mapping between persisted optional `MotionEase` values and the shared `Select`/`Tooltip` primitives. The preview rail animation keyframe is global in `src/styles.css`; future motion ease controls should reuse `motionEaseSelectValue` when `undefined` means the default `easeInOut` curve and `EaseSelectItems` for graph/animation previews.
