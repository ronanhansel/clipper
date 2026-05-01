# Polish Workspace

## Goal

- Start v0.2 by polishing the full editor experience: reliable timeline snap selection, two-decimal numeric clamping, an asset-manager left panel, a tools tab, cleaner top chrome, right-panel Agent tab content, and a reusable color selector.

## Notes

- Main renderer implementation is currently concentrated in `src/App.tsx`.
- Shared primitives available before this pass are `Input`, `Textarea`, `Select`, `Checkbox`, and `Tooltip`; there is no `components.json` in the repo.
- v0.2 planning lives at `build/v0.2/PLAN.md`.

## Implementation

- Bumped project metadata from `0.1.0` to `0.2.0` in `package.json` and `package-lock.json`.
- Added `build/v0.2/PLAN.md` and updated the root `AGENTS.md` example memory path to use `v0.2`.
- Reworked snap selector logic through `getTopTimelineItemAtTime`, matching the visual timeline stack: Pan, Zoom, then Parts.
- Added recursive numeric sanitization in `normalizeProject` so persisted project floating point numbers are rounded to at most two decimal places.
- Replaced the old left sidebar with two tabs: a File Manager with drag import, inline rename, reorder, and folder creation; and a Tools tab for timeline actions.
- Removed the duplicate top-center tools row and centered a smaller rounded Interactive/Code switcher with smoother transitions.
- Added right inspector tab state and moved Snapshot plus Agent Context into the Agent tab.
- Removed the redundant `3 visible timelines` footer badge.
- Added a reusable `ColorSelector` component with a custom saturation/value board, hue rail, hex input, and requestAnimationFrame-throttled updates; wired it into frame background color editing.
- Extended colour picker usage to hex-valued background layer and object style colour fields (`background`, `backgroundColor`, `color`, `borderColor`, `fill`, `stroke`) while keeping JSON style editing available.
- Reconciled asset-manager copy, duplicate, and delete UI hooks with helper implementations so the expanded asset row controls typecheck.
- Reverted the colour-selection-table-specific swatch/table change. The reusable `ColorSelector` now includes a pipette button using the native `EyeDropper` API to sample colours from the app/window, with a toast fallback when unsupported.
- Color picker popovers now coordinate through a `clipper:color-picker-open` window event so opening one picker closes any previously open picker and prevents overlapping panels.

## Verification

- `npm run typecheck`
- `npm test`
- `npm run build`
- After colour picker extension: `npm run typecheck`, `npm test`, `npm run build`
- After eyedropper picker: `npm run typecheck`, `npm test`, `npm run build`
- After single-open color picker behavior: `npm run typecheck`, `npm test`, `npm run build`
