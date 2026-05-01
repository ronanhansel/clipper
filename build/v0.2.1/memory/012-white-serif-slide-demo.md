# White Serif Slide Demo

## Summary
- Added a focused two-slide presentation demo named `White Serif Hero Demo` as a real project under `clipper/projects/prj_white_serif_demo`.
- Both slides use warm white backgrounds, bold centered serif typography, and time-driven hero animation intended for playback and scrubbing.
- Added a top-bar `Open` button that loads a selected `project.json` from the app's `clipper` directory.
- The last opened manifest path is stored in `clipper/app-state.json` and mirrored in `localStorage` under `clipper.activeProjectManifestPath` for browser/dev fallback.

## Architecture Note
- The demo lives in `clipper/projects/prj_white_serif_demo/project.json` plus source files under `scn_white_serif_demo`, so it is opened through normal project persistence instead of being hardcoded into the bundled fallback sample.
- Each slide is a single full-frame `template` object in its composition source, keeping the editorial animation self-contained and avoiding new rendering primitives.
- The template sources compute motion from `{ time }` and return inline HTML/CSS. This reuses the existing `renderFrameTemplate` path and keeps animation deterministic for playback, scrubbing, and export.
- Project opening is implemented through `clipperHost.openProjectManifest`, an Electron IPC bridge, and `loadProjectFromManifest` in `App.tsx`; saving and editor-state autosave switch to the active manifest path after opening.
- Startup now reads the persisted active manifest path from `clipper/app-state.json` before loading a project and falls back to the bundled sample only if that project cannot be loaded, clearing the stale stored path when fallback is used.
- The editor is now mounted only after the boot project has loaded, so the default sample is no longer shown briefly before the persisted project appears.

## Reuse Guidance
- For future designed slide demos, prefer creating a project folder under `clipper/projects` with its own manifest and part source files.
- Extract a shared template source builder only after multiple demos need the same motifs; for now, the two slide templates are intentionally local and art-directed.
