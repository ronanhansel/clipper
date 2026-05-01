# 022 Smoother Zoom Drag

## Context

- User reported that grabbing and dropping zoom markers felt choppy and that timeline separators appeared too abruptly.

## Work Log

- Updated zoom marker pointer dragging to batch live movement through `requestAnimationFrame`.
- Removed tenth-second quantization from live zoom marker move and resize updates so timeline blocks track the pointer smoothly.
- Added a short fade/scale-in animation for part boundary separators while a zoom marker is being dragged.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.
