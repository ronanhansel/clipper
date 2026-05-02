# OS File Manager Drag Hover Reset

## Goal

Fix the inconsistent File Manager row hover state after dragging a composition out of the OS-backed File Manager and dropping it into the timeline.

## Architecture Note

- The OS-backed File Manager uses `src/components/OsFileManager.tsx` and a global external composition drag bridge for timeline drops.
- This note is historical from the Arborist implementation. The current OS-backed File Manager uses `NativeTree`, has no `data-external-composition-drag` hover suppression, and no deferred visual restore.
- As of the May 02 follow-up in `build/v0.2.9/memory/007-native-file-effects-tree.md`, composition drags keep NativeTree's ghost as the single visual owner/path; the external bridge only emits move/drop/cancel events for timeline/editor targets.

## Implementation

- Historical implementation added external visual reset/deferred restore around Arborist state.
- Current implementation removed those handoff remnants. Do not reintroduce outside/inside visual state, deferred restore, or File Manager ghost suppression for composition drags unless the tree drag architecture changes again.

## Verification

- `npm run typecheck` passes.
- `npm run typecheck` passes after the deferred visual restore update.
