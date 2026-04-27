# 014 Global Scrollbar CSS

## Context

- User requested transparent scrollbar backgrounds across the whole app and asked that app-wide behavior be implemented in global CSS.
- Existing scrollbar styling was duplicated through a React `transparentScroller` Tailwind class string.

## Work Log

- Added global scrollbar styling to `src/styles.css` inside `@layer base`.
- Removed the `transparentScroller` constant and its usages from `src/App.tsx`.
- Updated `AGENTS.md` and `DESIGN.md` to direct future app-wide/global styling or behavior into `src/styles.css` instead of repeated component utilities.
- Updated the older transparent scrollbar memory note to reflect the new global CSS location.

## Verification

- `npm run typecheck` passes.
