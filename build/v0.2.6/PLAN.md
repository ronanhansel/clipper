# v0.2.6 Plan

## Focus

v0.2.6 focuses on motion movement authoring. The first milestone is restructuring the timeline into configurable Comp, Motion, and Adjust layers, then expanding motion markers beyond pan/zoom with rotate and future layer-aware motion controls.

## Goals

- Split the timeline surface into named Comp, Motion, and Adjust bands with right-edge layer controls.
- Allow timeline layer names and visibility to be edited without changing existing composition timing behavior.
- Add motion layer management for the current direct timeline flow, with motion layers always above Comp and below Adjust.
- Add Rotate as a motion effect alongside Pan and Zoom, using the pan motion color family and pan-like timing interactions.
- Preserve existing zoom behavior and marker drag/resize constraints while making the timeline ready for multiple motion, comp, and adjust layers.

## Progress

- Started with the timeline layer dynamics and motion marker expansion.
