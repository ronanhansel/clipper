# Composition Duration Inspector

## Context

Add inspector controls for editing a composition part's duration without requiring source-code edits.

## Implementation

- Added a simple duration number field to `FrameInspector` in `src/App.tsx`.
- The control edits the selected composition part through the existing project update path, which also regenerates the TypeScript composition source via `partToSource` synchronization.
- Duration input is clamped to `MAX_PART_DURATION_SECONDS` and cannot shrink earlier than the last existing pan or zoom marker edge, preserving current marker bounds.

## Architecture Note

Duration editing stays in `src/App.tsx` with the existing inspector and selected-part mutation flow because part metadata, source synchronization, validation, and timeline rebuilding already converge there. Future composition-level settings should reuse `FrameInspector` for selected-part metadata and core constants from `src/core/types.ts` for shared limits.
