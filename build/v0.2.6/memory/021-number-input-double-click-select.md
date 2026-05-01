# Number Input Double-Click Select

## Summary

- Restored double-click select-all behavior for shared numeric fields.
- Implemented in `src/components/ui/input.tsx` so every `Input type="number"` keeps the same interaction while preserving number scrubbing.

## Architecture Note

The behavior lives in the shared `Input` primitive rather than individual inspector panels because numeric fields are reused across object, chart, timeline, motion, and settings controls. The handler delegates any consumer-provided `onDoubleClick` first, then selects the full field value only for `type="number"` when the event has not been prevented. Number scrubbing remains pointer-move activated through the existing pending scrub state.
