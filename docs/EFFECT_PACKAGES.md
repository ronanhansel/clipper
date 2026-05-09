# Effect Packages

Clipper effects must be package-first. Future built-in effects, practical effects, and externally contributed effects should ship as self-contained packages instead of scattering effect-specific cases through editor panels, preview, export, or timeline code. Current extension model is in-process TypeScript registry APIs plus external package declarations; no npm/plugin loader exists yet.

## Package Types

- Adjustment packages live under `src/core/effects/builtins/adjustments/[packageName]/` for built-ins.
- Motion packages live under `src/core/effects/builtins/motion/[packageName]/` for built-ins.
- Transition packages live under `src/core/effects/builtins/transitions/[packageName]/` for built-ins.
- Post-process packages live under `src/core/effects/postprocess/` when an effect needs WebGL preview/export rendering.
- External packages should produce same `EffectPackage` and optional `PostProcessPackage` declarations and register through registry APIs.

## Required Files

Every prebuilt effect package needs:

- `manifest.yml`: id, category, name, label, group/groups, default duration, default params, and inspector controls.
- `logic.ts`: runtime behavior only, typed with `AdjustmentEffectPackage`, `MotionEffectPackage`, or `TransitionEffectPackage` helpers.
- Tests when logic touches timing, rendering plans, validation, export, or registry behavior.
- Memory update under `agent-log/[version]/memory/` describing package intent and wiring.

Practical visual effects should include all reusable artifact logic in package/core modules, not React components. Examples: film grain overlays, VHS tracking shaders, lens uniforms.

## Built-In Wiring

- Built-in adjustment packages live in `src/core/effects/builtins/adjustments/[packageName]/manifest.yml` and `logic.ts`, then get imported and wrapped by `createAdjustmentEffectPackage()` in `src/core/effects/builtins/adjustments/index.ts`.
- Built-in motion packages are exposed through `src/core/effects/motion.ts` and use `MotionEffectPackage` declarations with `createDefaultBlock()`.
- Built-in transition packages are exposed through `src/core/effects/transitions.ts` and use `createTransitionEffectPackage()` where manifests are present.
- `src/core/effects/registry.ts` imports built-in adjustment, motion, and transition lists, seeds one mutable in-process registry, and exposes category arrays used by app code.
- Post-process built-ins are declared in `src/core/effects/postprocess/packages.ts` and seeded by `src/core/effects/postprocess/registry.ts`.
- Add built-ins through package indexes and registries only. Do not add package ids to editor shell, inspector panels, preview router, export router, or timeline branches.

## Manifest Contract

- `id` must be stable and namespaced, e.g. `clipper.adjustment.vhsTracking`.
- `category` must be `adjustment`, `motion`, or `transition`.
- Motion manifests include `kind`, `name`, `label`, `group`/`groups`, optional `tags`, and `defaultDuration`.
- Adjustment manifests include `name`, `label`, `group`/`groups`, optional `tags`, `defaultDuration`, `defaultParams`, and optional controls.
- Transition manifests include `name`, `label`, `group`/`groups`, optional `tags`, `defaultDuration`, `defaultParams`, and optional render logic.
- `group` or `groups` controls effect library placement. Prefer `groups` for nested menus.
- `defaultParams` must include every inspector control default.
- `paramControls` and `pointControls` drive inspector UI. Do not hardcode controls in React panels.
- Use shared control types from `src/core/effects/types.ts`; extend those types before inventing UI-specific shapes.

## Manifest Parser Limits

Manifests are parsed by local parser in `src/core/effects/manifest.ts`, not full YAML.

- Supported values: strings, numbers, booleans, `null`, indented objects/lists, and inline JSON arrays/objects.
- Supported comments: whitespace-prefixed inline comments via `\s+#`; keep full-line comments out unless tested.
- Unsupported YAML features: anchors, aliases, multiline strings, YAML escape semantics, flow YAML that is not valid JSON, complex keys, and type tags.
- Inline objects/lists must be valid JSON, e.g. `{ "value": 1 }` or `["a", "b"]`.
- `groups` arrays normalize into `group` with `/`; `group` strings split into `groups`.
- Keep manifests simple and test parser behavior when adding new shapes.

## Control Schema

Adjustment inspector controls are manifest-owned and typed in `src/core/effects/types.ts`.

- Number control: `key`, `label`, `type: "number"`, `defaultValue`, optional `min`, `max`, `step`, `disabledWhen`, `section`, `inlineGroup`, `inlineToggle`, `inlineSectionTrigger`.
- Select control: `key`, `label`, `type: "select"`, `defaultValue`, `options`, optional `disabledWhen`, `section`, `inlineGroup`, `inlineToggle`, `inlineSectionTrigger`.
- Boolean control: `key`, `label`, `type: "boolean"`, `defaultValue`, optional `disabledWhen`, `section`, `inlineGroup`, `inlineSectionTrigger`.
- Point control: `label`, `xKey`, `yKey`, defaults, `coordinateSpace: "percent" | "frame"`, optional axis labels, `pickLabel`, `disabledWhen`, `section`, `inlineGroup`.
- Sections can be string or `{ key, label, description?, display? }`; grouped controls always render as popover groups. `display` only supports `dialog` for explicitness; inline section cards are not allowed.
- Use `section` to group related controls such as artifacts, masks, or speed settings. Do not add card-within-card inspector sections; groups must open as popovers to keep the pane short.
- Use matching `inlineGroup` values on adjacent same-kind controls so the inspector can render them side by side; keep related pairs next to each other in manifest order.
- Use `inlineSectionTrigger` when a primary control needs an advanced-settings button beside its input. The trigger opens a named popover section; do not put the primary control inside that same section. Set `icon: "settings"` for icon-only advanced buttons and keep `label` as accessible text/title.
- Collapsing/hiding controls is not supported in the app, API, or manifests. Keep controls visible and use `disabledWhen` to explain unavailable options.
- Conditions support `key`, `truthy`, `equals`, `reason`, nested `and`, and nested `or` for disabled checks.
- Motion mend transition controls support number/select controls inside `mendTransitionOptions`.
- New control needs shared type, shared renderer, default param coverage, and tests. No package-specific React branch.

## Logic Hooks

Logic lives in package `logic.ts` or direct package declaration, never in components.

- Motion: `createDefaultBlock(input)` creates `MotionBlock`; optional `mendTransitionOptions` declares mending UI/options.
- Adjustment: `applySceneTime(input)` remaps scene time; `applyVisualStyle(input)` returns CSS-safe filters/overlays; `collectPostProcessPasses(input)` returns post-process pass data; `getDisplayElapsed(input)` controls display time; `validate(layer)` returns error string or `null`; `timeSensitive` and `requiresLiveDomPostProcessSource` flag runtime behavior.
- Transition: `applyVisualStyle(input)` returns frame/camera/overlay style; `renderSequence(input)` returns A/B sequence styles and may return shared WebGL `postProcessPasses` for full-frame transition composites.
- Hooks receive typed scene/layer/frame inputs and return data, not renderer instances or component nodes.
- Preview and export must consume same package data path; if parity is impossible, validation must reject unsupported behavior.

## Registry APIs

Use these APIs instead of editing call sites:

- `registerEffectPackage(packageDefinition)` registers one motion, adjustment, or transition effect.
- `registerEffectPackages(packageDefinitions)` registers many effects.
- `registerEffectCategoryDeclaration(declaration)` registers category library/timeline/default metadata.
- `registerEffectCategoryMetadata(metadata)` updates category library metadata while preserving existing timeline/default metadata.
- `getEffectPackage(effectId)` and category-specific getters resolve packages.
- `getEffectLibrarySections()` drives effect library sections and labels.
- `getEffectTimelineMetadata(category)` drives timeline style/drop/lane metadata.
- `getEffectPackageTimelineDefaultDuration(effectId)` resolves package default duration before timeline fallback duration.
- `registerPostProcessPackage(packageDefinition)` registers WebGL post-process rendering.
- `getDefaultPostProcessPackages()` feeds preview/export renderer creation.

Registry semantics:

- Registries are mutable in-process arrays/maps seeded by built-ins at module load.
- Registering existing `id` or post-process `kind` replaces current declaration; registering new one appends it.
- `registerEffectPackage()` syncs category arrays after each write; consumers should resolve through exported getters/arrays instead of retaining stale filtered copies.
- `getEffectLibrarySections()` returns sections from registry metadata and is source for ToolsPanel effect sections.
- Category declarations are source for timeline gradients, adornments, lane affinity, drop mode, and default package ids.
- External packages are TypeScript declarations loaded in process and registered through APIs. Do not document or rely on npm/package-manager discovery until loader exists.

If future package needs new extension point, add that extension point to package types and registry APIs first. Do not add package-specific branches to app shell, inspector, export, or timeline code.

## Post-Process Contract

Use post-process package when effect needs pixel sampling, displacement, masking, channel shifts, multi-source texture work, or preview/export parity.

Required pieces:

- Pass type in `src/core/effects/postprocess/[name].ts` with `kind`, `target`, uniforms, and pass factory.
- WebGL renderer in `src/core/effects/postprocess/[name]WebGlRenderer.ts`.
- Package entry in `src/core/effects/postprocess/packages.ts` or external `registerPostProcessPackage()` call.
- Adjustment logic uses `collectPostProcessPasses()` and returns passes, not renderer instances.
- Export renderer must use same uniforms as preview renderer.

Package shape:

- `kind`: pass kind matched against `PostProcessPass.kind`.
- `createRenderer()`: creates preview WebGL renderer.
- `createExportRenderer(renderer)`: creates export bridge using same renderer/uniform semantics.
- `withFrameBackground?(pass, background)`: optional pass decorator for effects needing frame background.

Avoid WebGL for CSS-safe effects such as basic filters or simple overlays. Use `applyVisualStyle()` for those.

## ToolsPanel Behavior

- `ToolsPanel` calls `getEffectLibrarySections()` and builds one tree per category section.
- Tree folders come from `groups` or split `group`; labels come from package `label`.
- All discovered effect groups open by default and persist through `effectsPanelState.openGroups` after user toggles.
- Drag payload is `{ effect }` with effect id; drag label/accent resolves from registry metadata and category.
- Icons are category-level only: motion, transition, adjustment. Add metadata before adding package-specific icon branches.
- ToolsPanel does not own effect control schema, render behavior, export behavior, or package-specific layout.

## Timeline Metadata

Timeline effect UI must read category/package declarations, not hardcoded colors or package ids.

Category declaration timeline metadata currently supports:

- `laneCategory`: existing timeline lane family (`adjust`, `motion`, `transition`) used for compatibility with saved timeline rows.
- `previewCategory`: visual category for drag previews and blocks.
- `gradient`: `{ from, to, text }` for timeline blocks and drag previews.
- `adornment`: optional visual marker such as `center-divider` for symmetric transition previews.
- `dropMode`: `point` or `placement` for timeline drop behavior.
- `defaultDurationSeconds`: category-level fallback when package default duration is absent.

`DirectTimelinePanel` still owns legacy lane-specific placement rules for saved-data compatibility, but effect category resolution, timeline gradients, adornments, lane checks, and package duration lookup must go through registry helpers. New timeline behavior needs a category/package declaration first.

## Inspector Controls

`src/components/inspector/EffectControls.tsx` renders manifest-declared adjustment controls. It owns generic rendering for number, select, boolean, point controls, sections, inline groups, inline toggles, visibility, disabled reasons, and preview scrubbing. `TransitionInspector` renders manifest-declared transition `paramControls` for number/select/boolean controls alongside legacy name/duration/ease fields.

- Use `EffectControls` or extend its shared schema for new generic controls.
- Keep inspector panes compact: group related parameters into named popover sections and pair same-kind parameters with `inlineGroup` instead of adding long single-column rows. Never render grouped controls as inline cards inside the inspector.
- For primary-plus-advanced layouts, keep the primary field in the main inspector row and attach the popover with `inlineSectionTrigger`; put secondary controls inside that section, using `disabledWhen` instead of hiding controls when a local enable toggle is off.
- Do not reintroduce adjustment-specific control rendering inside `InspectorPanels.tsx`.
- Motion inspectors still contain legacy field layouts for saved marker/layer models. Transition packages can declare `paramControls` for package-owned parameters; future transition point/section controls should extend the shared schema first, then reuse shared control primitives.

## UI And Layout Rules

- Effect library layout must come from package metadata and `getEffectLibrarySections()`.
- Effect groups/menus must use `group` or `groups`; no fixed effect names or folders in panels.
- Inspector controls must come from manifests; no effect-specific inspector branches unless adding a generic control type.
- Manifests should define a clean inspector layout, not only parameter availability. When possible, place related controls side by side with `inlineGroup` and group dense families with `section`/`display: dialog` popovers to avoid overcrowded inspector panes. Inline card sections are prohibited.
- New controls must be shared, typed, and reusable across packages.
- Menus, rows, icons, and drag labels may use category metadata, not package ids.
- If package metadata is insufficient for UI needs, extend manifest/package declarations instead of hardcoding UI behavior.

## Contribution Checklist

1. Add package manifest and logic.
2. Add reusable helper modules for any practical/artifact logic.
3. Register built-in package from package index, or use public registry APIs for external packages.
4. Add post-process package only if pixel-level rendering is needed.
5. Verify preview and export use same package path.
6. Add tests for registry exposure, planning, renderer/export path, and parameter clamping.
7. Update `docs/EFFECT_PACKAGES.md` if new extension points are introduced.
8. Update version memory.

## Contribution Examples And Limits

Adjustment example:

1. Add `manifest.yml` with `category: adjustment`, defaults, controls, and groups.
2. Add `logic.ts` with `applyVisualStyle()` for CSS-safe work or `collectPostProcessPasses()` for WebGL work.
3. Export via adjustment built-in index or call `registerEffectPackage()` from external in-process setup.

Transition example:

1. Add manifest/default params.
2. Add `paramControls` for configurable transition params when needed.
3. Add `applyVisualStyle()` or `renderSequence()`.
4. If transition needs WebGL, have `renderSequence()` emit `postProcessPasses` and register matching post-process package.
5. Register package and test timeline/export behavior.

Post-process example:

1. Define pass data and renderer/export bridge.
2. Register `PostProcessPackage` by `kind`.
3. Have adjustment logic emit passes with matching `kind`, or transition `renderSequence()` emit matching passes for transition composites.

Limits:

- No runtime plugin loader, npm auto-discovery, sandbox, remote install flow, or user-managed package directory exists yet.
- External contribution means code loaded by app build/runtime and registered through in-process APIs.
- Effects cannot add bespoke inspector widgets, panel sections, timeline lanes, or export branches without first adding generic package metadata and shared UI/runtime support.

## Anti-Patterns

- Do not hardcode effect ids in React panels for controls, menus, layout, icons, or export routing.
- Do not create one-off browser inputs for package controls.
- Do not duplicate local storage or app state for effect configuration.
- Do not put shader/math/render logic inside components.
- Do not make preview-only effects; export must use same package data path or explicitly validate unavailable behavior.
