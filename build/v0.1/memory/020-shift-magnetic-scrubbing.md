# 020 Shift Magnetic Scrubbing

## Context

- User asked for Shift-held scrubbing to temporarily enable snap mode.
- User also asked for a magnetic icon in the player bar to trigger snap mode.

## Work Log

- Added a persistent magnetic scrub toggle in the player bar using the Lucide `Magnet` icon.
- Holding Shift while scrubbing temporarily enables the same magnetic snap behavior without changing the toggle state.
- Timeline scrubbing now snaps to nearby part boundaries and zoom marker start/end boundaries when snap mode is active.
- Added active snap styling to the zoom and parts timeline rows so the temporary or persistent mode is visible while scrubbing.
- Reworked the player bar into left timer, centered transport controls, and right-side tool controls; added a jump-to-end button for transport symmetry.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.
- `npm run typecheck` passes after player-bar layout update.
