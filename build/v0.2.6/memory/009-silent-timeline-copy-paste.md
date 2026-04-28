# Silent Timeline Copy Paste

## Status

Implemented a focused UX cleanup for timeline clipboard actions.

## Implemented

- Timeline block copy no longer shows a success toast from keyboard shortcuts or the node context menu.
- Timeline paste no longer shows success or failure toasts from keyboard shortcuts or the node context menu.
- Timeline cut toasts remain unchanged because the request only covered copy and paste.

## Architecture Notes

- The change stays in `src/App.tsx` because timeline clipboard state and commands already live there with project mutation and selection state.
- `pasteTimelineNodes()` remains the canonical mutation path; UI-triggered paste now calls a silent wrapper so behavior stays unchanged without popup feedback.
