# 013 Compact Controls And Path Truncation

## Context

- User requested smaller top/editor toolbar buttons, smaller sidebar controls, and safer asset-name display for long paths.

## Work Log

- Reduced the shared button primitive padding, radius, and text size.
- Tightened editor mode tabs, center toolbar buttons, left sidebar scene/tool buttons, and right inspector tabs.
- Added `truncateMiddle` and applied it to the project asset path with a full-value `title` tooltip.
- Constrained the asset path row with `min-w-0`, `overflow-hidden`, and `whitespace-nowrap` to prevent sidebar overflow.

## Verification

- `npm run typecheck` passes.
