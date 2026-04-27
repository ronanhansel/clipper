# 015 Browser Preview Save Bridge

## Context

- User reported that saving from the code pane showed `Filesystem bridge unavailable in browser preview` and prevented file saves.
- The code pane only used the Electron preload bridge, so a normal Vite browser preview could not read or write project part files.

## Work Log

- Added a Vite dev-server filesystem bridge in `vite.config.ts` with read/write endpoints under `/__clipper_fs/*`.
- Restricted browser-preview file access to the workspace `clipper/` directory so future save targets can move outside `clipper/projects` while still staying inside the app-owned content tree.
- Matched the Electron bridge boundary to the same workspace `clipper/` directory for consistent native and browser-preview behavior.
- Updated `src/App.tsx` to use Electron's preload bridge when available and fall back to the Vite bridge in browser preview.
- Save errors are now caught and shown in the code pane status instead of leaving the save action unhandled.
- Removed the browser-preview-specific editing status text; code pane now reports `Editing actual part file.` in both Electron and browser preview.
- Removed non-error code pane status messages entirely; the footer only appears when load/save validation fails.
- Replaced sample part imports from fragile depth-based `../../part-api` paths with `@clipper/part-api`.
- Added matching `@clipper/*` resolution in `tsconfig.json`, Vite, and Monaco so editor diagnostics and production builds resolve part API imports consistently.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes.
- Later status-only cleanup: `npm test` passes, while full `npm run typecheck` is blocked by current `Part` fixture data missing `frame` and `background` fields in `src/sampleProject.ts` and `src/core/timeline.test.ts`.
