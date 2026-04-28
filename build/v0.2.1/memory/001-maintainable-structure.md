# v0.2.1 Maintainable Structure

## Goal

Start the v0.2.1 maintainability pass by separating stable infrastructure, configuration, and app workflow types from the monolithic React entry file.

## Changes

- Bumped package metadata from `0.2.0` to `0.2.1`.
- Added `build/v0.2.1/PLAN.md` for the new version vision and testing scenarios.
- Added this memory file for follow-up agents.
- Added `src/app/clipperHost.ts` with a `ClipperHostService` class that owns renderer-to-host filesystem and video export calls.
- Added `src/app/config.ts` for shared runtime constants, default assets, Tailwind class tokens, and Monaco options.
- Added `src/app/types.ts` for app-level UI/workflow types used across the editor shell.
- Updated `src/App.tsx` to consume these modules instead of defining everything inline.
- Added `docs/ARCHITECTURE.md` as a contributor-facing structure and refactor workflow guide.
- Expanded `AGENTS.md` with maintainability rules that discourage mixed-responsibility spaghetti code and clarify when OOP is appropriate.
- Added `src/core/math.ts` for shared numeric normalization helpers.
- Added `src/core/assetTree.ts` for asset-tree transforms, lookup, movement, sorting, and drag/drop intent types.
- Added `src/core/markers.ts` for mended marker chain and zoom focus normalization logic.
- Added `src/core/project.ts` for project defaults, project normalization, and project-part replacement.
- Added `src/components/AppContextMenu.tsx` and `src/components/AssetManager.tsx` so asset UI and context menu behavior are reusable component modules instead of inline `App.tsx` sections.
- Added `src/app/richText.tsx` for rich text render/edit conversion helpers used by frame object editing.
- Added `src/app/services/exportService.ts` for project-package export, rendered-media preparation, video render/cancel delegation, export filenames, and host/browser export fallback handling.
- Added `src/app/services/projectPersistenceService.ts` for manifest loading, part-source loading, fallback sample loading, manifest/source saving, and source status messages.
- Added `src/app/services/fileDownloadService.ts` for browser download fallback behavior.
- Added `src/components/export/ExportMediaDialog.tsx` so export dialog and video export overlay UI live with export-specific components instead of the editor shell.

## Architecture Notes

- `src/app` is now the home for application-shell infrastructure and configuration that is not core domain math and not a reusable UI primitive.
- `ClipperHostService` is intentionally OOP because it represents a boundary adapter over the Electron/browser host environment.
- Pure logic should continue moving toward `src/core` as named functions with tests.
- Reusable UI should continue moving toward `src/components` and shared primitives.
- `App.tsx` should now be treated as the editor shell/orchestrator. Do not add new pure transformations, asset tree algorithms, project defaults, host calls, or large reusable panels directly to it.
- Host/file/export workflows should route through `src/app/services` rather than reaching into `window.clipper` from components.
- Export UI should stay under `src/components/export`; export business logic should stay in `src/app/services/exportService.ts`.

## Follow-Up

- Continue extracting pure project normalization and timeline/marker operations from `App.tsx` into `src/core` with tests.
- Split large presentational regions such as asset management, timeline panel, frame preview, and inspector into focused component files.
- Keep behavior-preserving refactors small enough to verify with `npm run typecheck` and focused tests.
- Good next seams are timeline marker layout/push logic, timeline panel rendering, color selector color math, code editor pane extraction, and frame preview rendering.
