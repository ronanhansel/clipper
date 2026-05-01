# App Component Extraction

## Summary

Refactored `src/App.tsx` so it only owns editor orchestration, project mutation, event handling, and high-level layout wiring. Inline React component definitions that previously lived below `App` were moved into focused component modules.

## Architecture Notes

- Shared controls live under `src/components`: `QuickAccessTooltip`, `FrameZoomBar`, `SettingsDialog`, `ToolsPanel`, `AgentPanel`, `ColorSelector`, and `CodePane`.
- Frame preview rendering lives in `src/components/preview/FramePreview.tsx`, including preview object/background rendering, selection overlays, pick overlays, and legacy preview animation helpers.
- Inspector panels live in `src/components/inspector/InspectorPanels.tsx`, with color utility reuse from `ColorSelector`.
- Timeline UI and timeline selection box logic live in `src/components/timeline/TimelinePanel.tsx`.
- Timeline marker selection and playback clock types were promoted to `src/app/types.ts` for reuse by extracted modules.
- Active camera marker evaluation now lives in `src/core/camera.ts` as `getActiveZoom` and `getActiveTranslation`, so both `App` and preview rendering use the same camera interpolation logic.

## Verification

- `npm run typecheck` passed.
- `npm test` passed: 3 files, 12 tests.

## Reuse Guidance

- Keep new UI pieces out of `App.tsx`; add them near their domain module and pass state/actions from `App` as props.
- Reuse `src/core/camera.ts` for camera preview math instead of duplicating zoom/pan interpolation in components.
- Keep high-frequency pointer preview behavior in the relevant interaction component or core helper, with canonical project commits still orchestrated by `App`.
