# Undo frame selection sync

Fixed stale frame selector overlays after undo/redo of object moves.

- Object drag commits update canonical project object bounds and the frame `selectionPayload`.
- Undo/redo restores project bounds but previously left `selectionPayload` with the pre-undo selected-object bounds, so the object snapped back while the selector box stayed at the dragged position.
- Added an effect in `src/App.tsx` that refreshes active frame `selectionPayload` from canonical `part.objects` whenever object data changes.
- If a selected object no longer exists after the project change, the frame selection is cleared.

Future notes:
- The selector overlay should be treated as derived UI state from canonical objects, especially after history navigation, source reloads, and object edits.
