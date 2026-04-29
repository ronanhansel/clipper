# v0.2.7 Aesthetic Overlay Adjustments

## Summary

Adding aesthetic visual adjustments that render as deterministic CSS overlays, including dust, scratches, vignette, and light leak effects.

## Architecture Notes

- Overlay adjustments extend the existing visual adjustment package path instead of adding a separate node type.
- `AdjustmentVisualStyle` now composes both CSS filters and overlay descriptors through `applyAdjustmentLayersToVisualStyle(...)`.
- Preview overlays render inside `FramePreview` above frame content but below editor selection overlays.
- Electron export mirrors the same overlay descriptors in its standalone HTML renderer so preview and exported media stay aligned.

## Status

- Added overlay descriptors to the shared visual adjustment style path.
- Added built-in Film Dust, Film Scratches, Vignette, and Light Leak adjustment packages.
- Preview renders overlay descriptors above frame content and below editor overlays.
- Timeline scrub visual feedback updates overlay DOM imperatively alongside filters.
- Overlay preview DOM is an imperative-only island under `[data-clipper-visual-adjustment-overlays]`; do not render React children there or scrub-time `replaceChildren(...)` can conflict with React deletion effects.
- Overlay effects now expose a package-owned `Target` select control. `Frame` overlays render inside the camera transform; `Camera` overlays render in the fixed camera viewport so frame/background motion does not move the overlay.
- New overlay effects default to `Camera` targeting, while users can switch to `Frame` in the adjustment inspector.
- Runtime fallback for missing overlay target is also `Camera`. Frame-target overlays use explicit high z-index in preview/export so arbitrary HTML frame content cannot cover them.
- Camera-target overlays render outside `data-clipper-perspective-stage` in preview so perspective/3D transforms cannot visually cut through fixed viewport overlays.
- Light Leak focus uses generic adjustment `pointControls` metadata (`focusX`, `focusY`, percent coordinate space) rather than app-level effect-id branching. Reuse this for future effects that need frame-pickable adjustment coordinates.
- Generic adjustment point picking must include both a persisted initial frame point and pointer-up commit handling. The active frame pick point is derived from `pointControls` metadata when an adjustment point picker is active.
- While generic adjustment point picking is active, FramePreview receives both `pickingTranslationPosition` and `pickingZoomFocus` so all motion effects are disabled for coordinate picking, matching pan target picking behavior.
- Adjustment point-pick mode now stays active after selection changes and commits until explicitly toggled, cancelled, or deleted. Shared `AdjustmentPointControlField` renders all X/Y + crosshair controls from package metadata.
- Shared point controls show visible `X` and `Y` field labels by default; package metadata can override them with `xLabel` and `yLabel`.
- Adjustment package controls support `disabledWhen` metadata for conditional disabled states. Pan's position fields/target picker are disabled when `followId` is set, matching tracker-owned coordinate behavior.
- Electron export mirrors overlay descriptors in the standalone frame renderer.
- Added render-runtime coverage for active/inactive overlay composition.
