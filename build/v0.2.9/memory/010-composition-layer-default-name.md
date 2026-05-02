# Memory - Composition Layer Default Name

## Context
The default name for composition layers in the timeline was displaying as "comp" instead of "Composition" when no explicit name was provided or when using the default project state.

## Changes
- Updated `TimelineCompositionLayerState`, `TimelineAdjustmentLayerState`, `TimelineTransitionLayerState`, and `TimelineMotionLayerState` in `src/core/types.ts` to include an optional `name` field.
- Updated `defaultTimelineLayerState` and `normalizeTimelineLayerState` in `src/core/project.ts` to include `name: "Composition"` for the default composition layer.
- Updated `buildDirectTimelineModel` in `src/components/timeline/directTimelineModel.ts` to prefer `layer.name` over deriving it from `layer.id`, ensuring custom names and the new default name are respected.

## Architecture Notes
- Timeline layers now explicitly support a `name` property in their state, which matches the behavior of `renameTimelineStateLayer`.
- The display name for composition layers now defaults to "Composition" for the root layer, while still falling back to the filename/id for other layers if no name is set.
