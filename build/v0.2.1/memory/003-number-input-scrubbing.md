# Number Input Scrubbing

## Context

Add editor-style value scrubbing for numeric text fields. Number inputs should support click-and-drag horizontal scrubbing, including values that can continue changing beyond screen edges.

## Implementation

- Added horizontal scrubbing to the shared `Input` primitive for `type="number"` fields.
- Scrubbing uses Pointer Lock plus document-level mouse movement so values can continue changing beyond the screen edge.
- Existing field `min`, `max`, `step`, disabled/read-only state, and `onChange` flows are preserved.
- The cursor no longer changes on hover; it only switches to horizontal resize while a scrub is active.
- Scrubbing defaults to commit-on-release. Reusable props on `Input` allow continuous commits with throttling: `numberScrubMode="continuous"` and `numberScrubCommitThrottleMs={80}`.
- Scrubbed values trim redundant trailing decimal zeros, so `9.0` displays as `9` while fractional values such as `9.5` remain fractional.

## Architecture Note

The behavior lives in `src/components/ui/input.tsx` so inspector, settings, and future numeric fields inherit the same editor-style interaction without duplicated per-field code. Value bounds remain owned by each field through native `min`, `max`, and `step` props, while domain-specific clamping still happens in existing `onChange` handlers where needed. Commit-on-release is the default to avoid broad React/project updates during high-frequency pointer movement; opt into continuous commits only when live semantic updates are required.
