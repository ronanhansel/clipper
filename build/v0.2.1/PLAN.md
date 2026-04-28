# Clipper v0.2.1 Plan

## Vision

Clipper v0.2.1 is a maintainability pass. The focus is reducing large-file coupling, documenting sustainable workflows, and moving the app toward a professional open-source structure with clear module boundaries.

## Product Focus

- Keep visible editor behavior stable while improving internal organization.
- Extract host/platform adapters, reusable app configuration, app-level workflow types, and pure project logic out of monolithic UI files.
- Document architecture rules that discourage spaghetti code and encourage modular, reusable, testable code.
- Preserve the existing Electron + Vite desktop workflow and current UI primitives.

## Current Status

- v0.2.1 version bump started.
- First cleanup extracted platform access into `src/app/clipperHost.ts`.
- Shared app constants moved into `src/app/config.ts`.
- App workflow types moved into `src/app/types.ts`.
- Future-agent maintainability guidance added to `AGENTS.md`.
- Zustand scoped providers now own shared project/editor state under `src/app/state`.
- `App.tsx` is being reduced toward orchestration/layout only, with reusable components and derived editor models extracted into domain modules.
- High-frequency scrub/playback state remains globally shareable, but must be consumed through narrow subscriptions and render caches rather than broad root-store subscriptions.

## Testing Scenarios

- `npm run typecheck` passes after each extraction.
- Project load/save continues using the same manifest and part source paths.
- Video export still routes through the desktop host bridge.
- Editor UI remains visually unchanged after constants/type extraction.
- Timeline scrubbing remains smooth after state-store changes; avoid broad subscriptions to `currentSceneTime` or other high-frequency editor fields.
