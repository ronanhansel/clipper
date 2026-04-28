# Zustand Editor State

## Summary

Replaced the flat `App.tsx` `useState` tree with provider-backed Zustand stores. The initial migration moved editor/session state and project document/source state into scoped stores while keeping high-frequency pointer refs local to the owning component.

## Architecture Notes

- Use scoped providers rather than module-singleton stores so Electron windows/tests can mount isolated editor instances.
- `src/app/state/editorStore.tsx` owns editor/session state: mode, timeline mode, selections, playback state, preview controls, scrub settings, panels, export/settings UI, and context menu state.
- `src/app/state/projectStore.tsx` owns the active project document, saved project snapshot, loaded part sources, and saved source snapshot.
- Keep high-frequency pointer/rAF refs in the component or interaction owner; do not move drag, resize, scrub preview refs into Zustand unless they represent canonical semantic state.
- `currentSceneTime` remains canonical global editor state in `src/app/state/editorStore.tsx`. `App.tsx` must not broadly subscribe to the whole editor store; it uses a narrow store subscription and a local render cache updated through `startTransition` so scrub commits stay shareable without invalidating the entire app controller synchronously.
- Store field setters now suppress no-op writes with `Object.is`, avoiding unnecessary Zustand notifications when callers set the existing value.
- Root store selector wiring lives in `useAppEditorState` and `useProjectDocumentState` instead of inline selector trees inside `App.tsx`.
- Timeline/preview/marker/unsaved-change derived data lives in `src/app/state/editorDerivedState.ts`, keeping `App.tsx` focused on orchestration and event wiring while memoizing derived marker arrays and camera preview inputs in one place.
- Store actions should be BLoC-like commands (`setMode`, `selectObject`, `clearMarkerSelection`) rather than exposing many raw setters where a semantic command is clearer.
- Derived project/timeline/camera values should remain selector hooks or memoized domain helpers rather than duplicated state.
- `App.tsx` now mounts `ProjectStoreProvider` and `EditorStoreProvider`, then consumes state through selector hooks instead of declaring dozens of independent React states.

## Verification

- `npm run typecheck` passed after moving scrub time back into the global store with narrow subscriptions.
- `npm run typecheck` passed after no-op setter suppression and derived-state extraction.
- `npm test` passed: 3 files, 12 tests.

## Follow-Up

- The state-management preference is now documented in `AGENTS.md`, `docs/ARCHITECTURE.md`, and `build/v0.2.1/PLAN.md`: shared canonical state should stay in scoped Zustand stores, while performance is handled through narrow selectors, no-op write suppression, transient local rAF/DOM machinery, and `startTransition` render caches for global high-frequency state.
- Convert prop-heavy components such as `TimelinePanel`, `FramePreview`, inspector hosts, export/settings hosts, and asset/code panes to read narrowly from store selector hooks instead of receiving broad prop trees from `App.tsx`.
- Add store-level tests for semantic commands once more project mutation logic is moved behind actions.
