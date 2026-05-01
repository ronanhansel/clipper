# 012 Compact Parts Timeline

## Context

- User wanted the parts row to be shorter, labels to be smaller, and the purple scrub ticker to reach the bottom of the parts row.
- The timeline footer used a fixed `82px` parts row and a fixed `162px` scrub line height.

## Work Log

- Reduced the parts grid row and track from `82px` to `58px`.
- Reduced part button padding and set part label text to `13px`, with the centered `Clip` marker and duration set to `12px`.
- Updated the scrub ticker line height from `162px` to `158px`, matching the distance from the tick row to the new bottom of the parts row.

## Verification

- `npm run typecheck` passes.
