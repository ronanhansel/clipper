# Effect Packages

Clipper effects must be package-first. Future built-in effects, practical effects, and externally contributed effects should ship as self-contained packages instead of scattering effect-specific cases through editor panels, preview, export, or timeline code.

## Package Types

- Adjustment packages live under `src/core/effects/builtins/adjustments/[packageName]/` for built-ins.
- Motion packages live under `src/core/effects/builtins/motion/[packageName]/` for built-ins.
- Transition packages live under `src/core/effects/builtins/transitions/[packageName]/` for built-ins.
- Post-process packages live under `src/core/effects/postprocess/` when an effect needs WebGL preview/export rendering.
- External packages should produce the same `EffectPackage` and optional `PostProcessPackage` declarations and register through registry APIs.

## Required Files

Every prebuilt effect package needs:

- `manifest.yml`: id, category, name, label, group/groups, default duration, default params, and inspector controls.
- `logic.ts`: runtime behavior only, typed with `AdjustmentEffectPackage`, `MotionEffectPackage`, or `TransitionEffectPackage` helpers.
- Tests when logic touches timing, rendering plans, validation, export, or registry behavior.
- Memory update under `agent-log/[version]/memory/` describing package intent and wiring.

Practical visual effects should include all reusable artifact logic in package/core modules, not React components. Examples: film grain overlays, VHS tracking shaders, lens uniforms.

## Manifest Contract

- `id` must be stable and namespaced, e.g. `clipper.adjustment.vhsTracking`.
- `category` must be `adjustment`, `motion`, or `transition`.
- `group` or `groups` controls effect library placement. Prefer `groups` for nested menus.
- `defaultParams` must include every inspector control default.
- `paramControls` and `pointControls` drive inspector UI. Do not hardcode controls in React panels.
- Use shared control types from `src/core/effects/types.ts`; extend those types before inventing UI-specific shapes.

## Registry APIs

Use these APIs instead of editing call sites:

- `registerEffectPackage(packageDefinition)` registers one motion, adjustment, or transition effect.
- `registerEffectPackages(packageDefinitions)` registers many effects.
- `getEffectPackage(effectId)` and category-specific getters resolve packages.
- `getEffectLibrarySections()` drives effect library sections and labels.
- `registerPostProcessPackage(packageDefinition)` registers WebGL post-process rendering.
- `getDefaultPostProcessPackages()` feeds preview/export renderer creation.

If a future package needs a new extension point, add that extension point to package types and registry APIs first. Do not add package-specific branches to app shell, inspector, export, or timeline code.

## Post-Process Contract

Use a post-process package when an effect needs pixel sampling, displacement, masking, channel shifts, multi-source texture work, or preview/export parity.

Required pieces:

- Pass type in `src/core/effects/postprocess/[name].ts` with `kind`, `target`, uniforms, and pass factory.
- WebGL renderer in `src/core/effects/postprocess/[name]WebGlRenderer.ts`.
- Package entry in `src/core/effects/postprocess/packages.ts` or external `registerPostProcessPackage()` call.
- Adjustment logic uses `collectPostProcessPasses()` and returns passes, not renderer instances.
- Export renderer must use same uniforms as preview renderer.

Avoid WebGL only for CSS-safe effects such as basic filters or simple overlays. Use `applyVisualStyle()` for those.

## UI And Layout Rules

- Effect library layout must come from package metadata and `getEffectLibrarySections()`.
- Effect groups/menus must use `group` or `groups`; no fixed effect names or folders in panels.
- Inspector controls must come from manifests; no effect-specific inspector branches unless adding a generic control type.
- New controls must be shared, typed, and reusable across packages.
- Menus, rows, icons, and drag labels may use category metadata, not package ids.
- If package metadata is insufficient for UI needs, extend manifest/package declarations instead of hardcoding UI behavior.

## Contribution Checklist

1. Add package manifest and logic.
2. Add reusable helper modules for any practical/artifact logic.
3. Register built-in package from the package index, or use public registry APIs for external packages.
4. Add post-process package only if pixel-level rendering is needed.
5. Verify preview and export use same package path.
6. Add tests for registry exposure, planning, renderer/export path, and parameter clamping.
7. Update `docs/EFFECT_PACKAGES.md` if new extension points are introduced.
8. Update version memory.

## Anti-Patterns

- Do not hardcode effect ids in React panels for controls, menus, layout, icons, or export routing.
- Do not create one-off browser inputs for package controls.
- Do not duplicate local storage or app state for effect configuration.
- Do not put shader/math/render logic inside components.
- Do not make preview-only effects; export must use same package data path or explicitly validate unavailable behavior.
