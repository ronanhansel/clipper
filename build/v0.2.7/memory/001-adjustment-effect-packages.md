# v0.2.7 Adjustment Effect Packages

## Summary

Started v0.2.7 with an effects focus. This pass expands adjustment layers with time-based effects while keeping effect behavior package-owned.

## Architecture Notes

- Adjustment effects should live in `src/core/effects/adjustments.ts` and be registered through `builtInAdjustmentEffects`.
- Runtime time remapping should remain generic through `applyAdjustmentLayersToSceneTime(...)`, which delegates to each package's `applySceneTime(...)` implementation.
- Inspector UI should read package parameter metadata rather than branching on individual effect IDs.
- Visual adjustment effects were added once preview/export shared a visual effect application path.
- Visual adjustment effects now use `AdjustmentEffectPackage.applyVisualStyle(...)`, composed through `applyAdjustmentLayersToVisualStyle(...)` in `src/core/adjustments.ts` and applied to the rendered frame contents in both React preview and Electron export.
- Built-in packages now live as one file per effect under `src/core/effects/builtins/adjustments/` and `src/core/effects/builtins/motion/`, with `src/core/effects/adjustments.ts` and `src/core/effects/motion.ts` kept as stable aggregators for existing imports.
- Keep lightweight visual packages CSS-filter based unless a future WebGL render path is introduced. CPU pixel manipulation should be avoided for playback/export because it scales poorly at 1080p frame rates.

## Status

- Version bumped to `0.2.7`.
- Plan created at `build/v0.2.7/PLAN.md`.
- Added package metadata for numeric adjustment params via `AdjustmentEffectPackage.paramControls`.
- Updated `AdjustmentInspector` to render adjustment params from package metadata instead of branching on effect IDs.
- Added time-based adjustment packages: `clipper.adjustment.freezeFrame`, `clipper.adjustment.speedChange`, `clipper.adjustment.loopStutter`, `clipper.adjustment.reverse`, and `clipper.adjustment.boomerang`.
- Kept Frame Skip as a package and moved its `Frame Step` control into metadata.
- Added tests for the new time remapping behaviors, package-owned validation, and default timeline rows derived from registered adjustment packages.
- Updated Speed Change so fast speeds clamp to the adjustment layer's own source window instead of exposing later compositions or frames.
- Updated the player timer to show adjusted relative time over total production time, while the timeline ruler/playhead remains absolute production time.
- Added `AdjustmentEffectPackage.timeSensitive` and `getDisplayElapsed(...)` so packages can opt into player display-time/duration mapping without changing timeline ruler semantics.
- Marked only Speed Change as time-sensitive. Other time remapping effects still affect rendered preview time but do not expand or contract the player timer total.
- Added inverse display-time mapping and playback advancement helpers so Speed Change also slows/speeds the absolute timeline playhead movement during playback while ruler labels remain stable.
- Added visual adjustment packages: `clipper.adjustment.brightness`, `clipper.adjustment.contrast`, `clipper.adjustment.saturation`, `clipper.adjustment.hueRotate`, and `clipper.adjustment.blur`.
- Refactored all built-in adjustment and motion packages into individual source files for easier user modification and extension.
- Updated Electron video export to understand package-style adjustment IDs for time remapping and visual filters, so preview and rendered media no longer diverge for the newer adjustment package shape.
- Added tests for visual adjustment filter composition and visual-only adjustments preserving scene time.
- Tightened the Effects tools panel after adding more packages: Adjust and Motion split the available sidebar height, each list scrolls internally, effect rows use compact local button styling, Select / Move was removed, and adjustment drag ghosts always use the default adjustment purple regardless of per-package accent.
- Added package-owned presentation metadata: `previewColor` controls effect drag ghost color and `timelineGradient` controls timeline block/drop-preview gradients. Built-in package files explicitly set these values so future users can modify visual presentation per package without touching registry/UI logic.
- Standardized all built-in package `previewColor` and `timelineGradient` presets to Frame Skip's purple presentation (`#8f65f2`, `#a77cff` to `#5f35c6`) while keeping the values package-owned for future editing.
- Grouped Brightness, Contrast, Saturation, and Hue Rotate into one `clipper.adjustment.colourGrade` package with four package-owned numeric controls. `Blur` remains a separate visual package.
- Timeline scrubbing now calls the app scrub callback on each rAF scrub preview so visual adjustments update during scrub movement; fast selection remains throttled separately.
- App render-time scene updates now bypass `startTransition` while timeline scrubbing is active. This prevents continuous pointer movement from starving the frame preview update, so visual adjustment filters such as Colour Grade and Blur appear in real time during scrub movement instead of waiting for pointer release.
- The scrub store write itself also bypasses `startTransition` while timeline scrubbing is active; otherwise the synchronous render subscription has no fresh time values to consume until React flushes the transition.
- `App.scrubToSceneTime` now also imperatively applies `applyAdjustmentLayersToVisualStyle()` to `[data-clipper-visual-adjustments]` during timeline scrubs. This gives Colour Grade/Blur immediate DOM-level feedback even if React rendering is delayed during pointer movement; canonical scene time still commits through the store path.
- Adjustment effect parameter number inputs now use `numberScrubMode="continuous"` with a 16ms throttle. The default input scrub mode commits only on release, which prevented Colour Grade/Blur parameter drags from updating the frame preview in real time.
- Adjustment effect parameter inputs pass each package control's `defaultValue` as `resetValue`, enabling the shared number field reset button for Colour Grade and Blur controls.
- Documented visual adjustment package conventions in `docs/EFFECT_NODES_AND_TIMELINE_INTERACTIONS.md`, including `applyVisualStyle`, package-owned presentation metadata, continuous parameter scrubbing, and reset defaults.
- Adjustment runtime now derives executable layers from visible timeline adjustment rows via `getExecutableAdjustmentLayers(...)`. Preview, playback time mapping, duration/validation, and save serialization no longer trust raw `scene.adjustmentLayers` entries whose timeline row was removed, preventing invisible/stale adjustment blocks from running or extending the scene.

## Verification

- `npm run typecheck`
- `npm test`
