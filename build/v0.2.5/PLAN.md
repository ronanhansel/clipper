# v0.2.5 Plan

## Focus

- Add scene-level adjustment layers that can overlap the linear composition timeline.
- Start with a frame-skipping adjustment that applies to playback/export for the adjusted time span.
- Keep adjustment behavior in reusable core helpers so preview and Electron export stay consistent.

## Progress

- Complete: adjustment layer model, UI controls, timeline lane, and frame-skip runtime support.

## Goals

- Adjustment layers are separate from normal compositions and do not change scene duration.
- Frame skipping quantizes animated preview time during affected ranges while preserving overall scene duration.
- Future adjustments should reuse the same scene-level layer shape and runtime evaluation helpers.
