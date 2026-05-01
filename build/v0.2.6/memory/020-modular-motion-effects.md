# Modular Package Effects

## Status

Implemented the breaking migration pass for canonical `motionBlocks` persistence and package-style built-in motion/adjustment effect metadata and logic.

Final decision: do not preserve arbitrary legacy bridges. Legacy marker arrays, marker `kind` behavior, app-specific drag tokens, the hardcoded `adjust` row, `adjustName` / `adjustHidden`, and `motion_pan` / `motion_zoom` / `motion_rotate` / `motion_perspective` row IDs are invalidated.

## Architecture Notes

- Motion layer IDs are row identities only. They no longer define effect behavior.
- Persisted motion effects should live in `CompositionClip.motionBlocks` / `TimelineClip.motionBlocks` using `effectId` and generic params.
- Legacy `zoomMarkers`, `translationMarkers`, marker `kind`, and legacy row IDs such as `motion_pan` / `motion_zoom` are invalidated as canonical behavior. Project load and save paths strip marker arrays, and current motion behavior is resolved from `motionBlocks[].effectId` plus package-owned timeline layer IDs.
- Timeline motion rows default to installed package IDs, e.g. `clipper.motion.pan`, `clipper.motion.zoom`, `clipper.motion.rotate`, and `clipper.motion.perspective`. Future agents must not reintroduce hardcoded `motion_*` row IDs.
- Timeline adjustment rows default to installed adjustment package IDs, e.g. `clipper.adjustment.frameSkip`. Future agents must not reintroduce the hardcoded `adjust` row or global `adjustName` / `adjustHidden` fields.
- Motion behavior must resolve from installed package definitions by `effectId`. Do not use `marker.kind` as a runtime fallback or compatibility bridge.
- Saves must pass through a serialization sanitizer that strips legacy marker contents and keeps `motionBlocks` as the canonical project data.
- Built-in effects now live as package-style definitions under `src/core/effects/`. `src/core/effects/registry.ts` is the app boundary: timeline/tools/render logic import installed packages from the registry and identify effects by package-owned `id` values.
- Motion packages (`src/core/effects/motion.ts`) own their `id`, `name`, `label`, accent, default duration, effect kind, and default block creation. Package IDs are also the default timeline row IDs; do not reintroduce `motion_pan`-style row constants.
- Adjustment packages (`src/core/effects/adjustments.ts`) own their `id`, `name`, `label`, accent, defaults, default layer creation, scene-time runtime logic, and validation. Adjustment layers persist `{ effect: { effectId, params } }` instead of app-specific `kind` fields.
- Adjustment lane state lives in `TimelineLayerState.adjustmentLayers[]` keyed by adjustment package ID. Each adjustment effect package gets its own timeline row, can be renamed/hidden independently, and drag/drop only lands on the matching package-owned row.
- Tools and Timeline no longer use app-level drag tokens like `adjust:frameSkip` or `motion:pan`; they pass package IDs through drag/pointer paths and resolve behavior from the registry.
- App creation paths now receive effect IDs and ask packages to create default adjustment layers or motion blocks. Adjustment runtime applies package logic through `getAdjustmentEffectPackage(effectId)`.
- Drag/drop motion creation must append the package-created block to canonical `motionBlocks`, then derive transient `zoomMarkers` / `translationMarkers` from `motionBlocks` for the remaining editor UI. Do not add only to transient marker arrays.
- Timeline motion move/resize/delete helpers must also commit through canonical `motionBlocks` and regenerate transient marker arrays. If a handler updates only `zoomMarkers` or `translationMarkers`, the next normalized render can snap back or ignore the edit.
- `serializeProjectForSave()` removes transient effect-specific arrays before writing files. New project data should be read from `motionBlocks` only.

## Current Modules

- `src/core/effects/types.ts`: package contracts for motion and adjustment effects.
- `src/core/effects/registry.ts`: installed effect package registry, default package accessors, and drag MIME helpers.
- `src/core/effects/motion.ts`: built-in motion effect packages and default block creation.
- `src/core/effects/adjustments.ts`: built-in adjustment effect packages, frame-skip runtime logic, defaults, and validation.
- `src/core/motionEffects.ts`: canonical motion-block normalization plus transient zoom/translation marker projections used by remaining editor UI paths. It should not contain legacy marker migration logic.

## Migration

- Existing legacy marker arrays do not migrate. Only canonical `motionBlocks` survive normalization/persistence.
- Motion block layer IDs should be package IDs such as `clipper.motion.pan`, `clipper.motion.zoom`, `clipper.motion.rotate`, and `clipper.motion.perspective` unless the user creates a custom row.
- Adjustment layers should persist package IDs such as `clipper.adjustment.frameSkip` and generic `params`, not app-specific `kind` fields.
- Timeline layer state should persist adjustment package rows under `adjustmentLayers`, not `adjustName` / `adjustHidden`.

## Guardrails

- Do not add fallback support for old `zoomMarkers`, `translationMarkers`, `marker.kind`, or `motion_*` IDs unless explicitly requested.
- Do not add fallback support for old hardcoded adjustment row state (`adjust`, `adjustName`, `adjustHidden`) unless explicitly requested.
- Do not hardcode effect creation in `App.tsx`, `ToolsPanel`, `TimelinePanel`, camera, or render runtime. Resolve via the package registry.
- If adding an effect, add a package definition and register it; app/timeline/render code should consume package metadata and behavior through registry helpers.

## Verification

- `npm run typecheck`
- `npm test`
