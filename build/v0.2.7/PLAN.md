# v0.2.7 Plan

## Focus

v0.2.7 focuses on effects. The first milestone expands adjustment layers with package-driven, time-based effects before introducing visual adjustment rendering later.

## Goals

- Keep adjustment effects authored as registry packages instead of hard-coded app behavior.
- Add useful time-remapping adjustment effects: Freeze Frame, Speed Change, Loop/Stutter, Reverse, and Boomerang.
- Make adjustment inspector controls package-driven so new time effects can expose params without per-effect UI branches.
- Preserve the existing Frame Skip behavior while migrating its controls to the package metadata path.
- Defer visual effects until the render/preview/export path can support visual adjustment application consistently.
- Move timeline interactions toward a master-workspace model where compositions are timeline blocks alongside motion and effect markers, not boundaries that define motion behavior.

## Progress

- Started with the package-driven time adjustment effect pass.
- Motion mend detection now operates in timeline time, including across composition boundaries, as an incremental step toward the timeline-master model.
- Composition clips are now timeline markers with explicit start times and composition layer IDs, allowing overlap, cropping, moving, and multiple composition lanes.
