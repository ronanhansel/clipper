# Timeline Pointer Transaction Unification

## Summary
- Added `src/components/timeline/useTimelinePointerTransaction.ts` as the shared pointer transaction path for timeline drag gestures.
- Refactored direct composition, adjustment, zoom, translation, and Compose timing drags in `TimelinePanel.tsx` to use the hook while keeping domain-specific timing, snapping, preview, and commit logic local to each call site.

## Architecture Notes
- The hook owns generic pointer transaction responsibilities: pending pointer/snap state, 4px activation threshold, rAF preview scheduling, Shift key rescheduling, auto-scroll callbacks, pointerup commit, pointercancel cancel, and listener/frame cleanup.
- Call sites provide thin callbacks for `onPreview`, `onCommit`, `onCancel`, `onDragStart`, and `onDragEnd`, so timeline block math remains near existing helper functions and can keep using current selection, snapping, layer-drop, and preview APIs.
- Pointercancel now clears previews/drag-active/category state without calling commit callbacks for the unified drag types.

## Reuse Guidance
- New timeline pointer drags should start from `useTimelinePointerTransaction` instead of installing their own window pointer/key listeners or rAF preview loops.
- Keep high-frequency preview writes in `onPreview`; commit canonical project updates only in `onCommit`; use `onCancel` for preview cleanup that must not persist state.
