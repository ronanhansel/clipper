# 012 Square Preview Frame

## Context

- User requested the preview frame to be non-rounded.

## Work Log

- Removed `rounded-[18px]` from the fixed preview frame viewport in `src/App.tsx`.
- Kept overflow clipping, border, black background, and interaction handlers unchanged.

## Verification

- `npm run typecheck` passes.
