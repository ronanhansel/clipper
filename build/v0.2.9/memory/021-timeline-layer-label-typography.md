# Timeline Layer Label Typography

## Summary
- Updated timeline layer label typography so Transition, Adjust, Motion, and composition layer names visually match the File Manager card heading.
- Non-editing labels now use the same `text-[13px]` size and `#aeb3c1` color treatment as the File Manager title.
- Inline rename inputs for layer labels use matching text sizing/color for consistency while editing.

## Architecture Notes
- The change lives in the shared `LayerLabel` primitive in `src/components/timeline/TimelinePrimitives.tsx`, so all timeline layer categories stay consistent without duplicating styles in `DirectTimelinePanel`.
- Existing hover, focus, locked, menu, and control behavior is preserved.

## Verification
- `npm run typecheck` passed.
