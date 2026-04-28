# Clipper Architecture

Clipper is a desktop-first Electron and Vite editor for TypeScript-authored motion graphics. Keep the codebase organized around explicit boundaries so editor behavior can grow without turning the main React shell into a mixed-responsibility file.

## Source Layout

- `src/app`: application-shell services, configuration, workflow types, host adapters, and long-lived controllers.
- `src/components`: reusable React components and shared UI primitives.
- `src/core`: pure domain logic for project manifests, timeline math, frame geometry, render/runtime evaluation, and other testable calculations.
- `src/lib`: small generic utilities that are not Clipper-domain specific.
- `electron`: desktop host process, preload bridges, filesystem/export integration, and command-line entry points.
- `clipper/projects`: runtime project data and author-authored part sources.
- `build/[version]`: version plans and memory files for future agents.

## Boundary Rules

- Keep React components focused on rendering and local orchestration.
- Move filesystem, Electron, export, and browser fallback behavior behind service adapters in `src/app` or `electron`.
- Move deterministic project transformations and timeline/render calculations into `src/core` with direct tests.
- Use shared UI primitives for fundamentals instead of one-off browser controls or inline control implementations.
- Prefer small named modules over large files with unrelated constants, state mutation, rendering, and platform I/O.

## State Management

- Canonical app/editor/project state that is shared across panels belongs in scoped Zustand providers under `src/app/state`, not in root component state just to avoid wiring.
- Use provider-scoped stores rather than module-singleton stores so Electron windows, tests, and future embedded editors can mount isolated state instances.
- Subscribe through narrow selector hooks. Root shells must not subscribe to whole stores because scrub/playback/selection updates can be high frequency.
- Keep high-frequency semantic state global when other app areas need it, but bridge it into render-heavy components through narrow subscriptions and `startTransition` render caches when needed.
- Keep pointer/rAF implementation details local to the interaction owner. Examples include pending pointer positions, animation-frame ids, DOM refs, live CSS-variable previews, drag deltas, and auto-scroll loops.
- Suppress no-op store writes with equality checks and prefer semantic actions over repeated raw setter batches.
- Move derived editor models, inspector inputs, marker selection summaries, and camera preview inputs into named hooks/helpers in `src/app/state` or pure `src/core` modules instead of rebuilding large derived trees inline in `App.tsx`.

Current examples:

- `src/app/state/editorStore.tsx` owns editor/session state and exposes scoped selector hooks.
- `src/app/state/projectStore.tsx` owns the active project document, loaded sources, and saved snapshots.
- `src/app/state/editorDerivedState.ts` derives active scene/part/timeline, selection summaries, camera preview inputs, and unsaved-change flags for the app shell.

## OOP Guidance

Use classes for stateful boundaries where object identity and lifecycle matter, such as host services, export controllers, or long-lived adapters. Keep pure calculations as functions so they remain easy to test, reuse, and reason about.

Current example:

- `src/app/clipperHost.ts` owns renderer-to-host file and export operations through `ClipperHostService`.

## Refactor Workflow

1. Identify a stable seam before editing behavior.
2. Extract types/config/services first when it can be behavior-preserving.
3. Extract pure calculations into `src/core` and add or update tests.
4. Keep visual components in `src/components` once they can be reused or independently understood.
5. Run `npm run typecheck` and relevant tests after each meaningful extraction.

## Performance Workflow

For pointer-heavy interactions, use transient previews during movement and commit canonical project state on release. Avoid persistence writes, project-wide derivations, or broad React state updates on every pointer frame unless the interaction cannot be represented another way.

For scrub/playback specifically, preserve the split between imperative visual feedback and canonical global editor state. The playhead can move via rAF and CSS variables during active movement, while shared scrub time remains in the editor store behind narrow subscriptions.
