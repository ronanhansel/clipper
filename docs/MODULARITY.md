# Modularity

How Clipper decomposes large surfaces. Read this before extracting a hook, splitting a file, or adding a new entry to a dispatch site.

## Core principle

Decompose by feature concern, not by file size. A 5000-line file is a smell, but the cure is moving cohesive units to their own home — not slicing arbitrary line ranges. Unrelated logic in the same file is the underlying defect; size is the symptom.

## File layout

- `src/app/features/<feature>/use<Feature>.ts` — feature hooks that own UI state, refs, effects, and handlers for one cohesive concern (presentation, editor-tabs, picking, preview-lifecycle, export-settings, …).
- `src/app/features/<feature>/<feature>Math.ts` — pure helpers for the same feature (no React, no DOM, no refs).
- `src/app/state/` — derived models, selectors, persisted-settings readers/writers.
- `src/components/<area>/` — reusable React. Per-type dispatch sites (e.g. `inspectorRegistry.ts`) live here.
- `src/components/<area>/sections/` — per-type implementations referenced by the registry.
- `src/core/` — pure domain (timeline math, project transforms, render-model derivation). Tested directly.
- `src/lib/` — generic utilities not tied to the domain.

## Feature-hook pattern

When `AppContent` (or any shell) accumulates multiple `useState`s, refs, and effects for one concern, extract a hook:

```
src/app/features/<feature>/use<Feature>.ts
```

Rules:

- Hook owns its state, refs, effects, and handlers.
- Hook accepts the minimum cross-cutting input (DOM refs, controller callbacks, store actions). Pass mutable refs when the hook runs upstream of the controller it needs to call.
- Hook returns only what consumers actually read. If a value is internal, don't expose it.
- JSX stays in the shell. The hook is behaviour; the shell is layout. (See `usePresentationController`, `useEditorTabsBridge`.)

When NOT to extract:

- The wrapper would only relocate the input bag (saved lines < new options-type lines). Leave it.
- The hook would have to import its consumer's internals. Lift the helpers into a shared module first, then extract.

## Pure helpers leave React

Math, transforms, snap rules, draw helpers, time-math collapse points: pure functions in plain modules. React-side wrappers stay in shells only when they close over UI controllers (e.g. `updateObjectById`).

Example:

```
src/app/features/compose/composeDrawing.ts        ← pure: path math, smoothing, snap
src/app/features/compose/useComposeToolShortcuts.ts ← React: keyboard wiring, refs
```

## Per-type registries

Type-varying UI is a registry, not a conditional cascade. The dispatch site reads `registry[item.type]` and renders sections. New type → new section file + registry entry. The dispatch site does not change.

```ts
export const inspectorRegistry: Record<string, InspectorTypeDefinition> = {
  text:      { sections: [BoundsSection, EffectsSection, TextSection, ...] },
  rect:      { sections: [BoundsSection, EffectsSection, RectSection, ...] },
  pattern2d: { sections: [BoundsSection, EffectsSection, Pattern2dSection] },
};

export const defaultInspectorTypeDefinition = {
  sections: [BoundsSection, EffectsSection, StyleColorSection, FillSection, ...],
};
```

Always include a default entry for unknown types — the registry must never throw on missing keys; it must fall through to a documented default.

## Context vs store

| Mechanism | Use for |
|-----------|---------|
| React context | Shared helpers (~30 callbacks, formatters, dispatchers) injected into deeply nested children. Stable across renders. |
| External store | Shared state (data the UI reads and writes). Changes per tick or per edit. |

Don't conflate. Helpers live in context; data lives in the store. A "context" carrying mutable data invalidates every consumer on every change.

## Strategy / decision functions

Decision logic (which renderer to mount, which strategy applies, which path to take) is a pure tested function:

```ts
export function selectPreviewStrategy(input: PreviewStrategyInput): PreviewStrategy
```

Inputs flow in; the result is exhaustive (TypeScript discriminated union). Single decision point.

Rules:

- Test the decision function directly against every branch.
- Consumers consume the result and mount accordingly.
- **Never re-decide inside the consuming component.** A duplicate guard drifts from the router and silently breaks the path it was meant to gate.

## Render seams

Render entry points are pure functions:

```ts
renderScenePreview(input)       // → camera transform, filters, frame style
renderCompositionPreview(input) // → composition descriptor
renderEffectPreview(input)      // → per-pass invocation contract
```

No React, no DOM, no refs. They are the seam for backend swaps (Canvas2d, WebGL, future Wgpu/native). A backend implements `RenderBackend.renderComposition` / `renderEffect` and consumes these pure inputs.

## Lifting before extracting

When a hook would depend on N helpers defined in its consumer, lift the helpers first.

Example sequence:

1. (Investigation) Hook would need 8 helpers from App.tsx → blocked.
2. (Prereq) Lift helpers into a shared module (`src/app/state/storedAppSettings.ts`).
3. (Extraction) Hook imports from the shared module. Clean cut.

Half-extractions with shims are forbidden. If you can't make a clean cut today, document the prereq in a memo and stop.

## File-size threshold

Files >1500 lines must be decomposed before adding new logic. Decomposition options, in order:

1. Pull a feature concern into `src/app/features/<feature>/`.
2. Pull pure helpers into a sibling math/util module.
3. Pull per-type sections into a registry.
4. Pull a stable seam (decision function, render entry, persisted-settings readers) into `src/app/state/` or `src/core/`.

If none of these apply, the file is genuinely cohesive — leave it. Otherwise, pick the highest-leverage extraction and move.

## Boundary checks before extracting

- Does the new module import from the consumer? If so, lift first.
- Does the new module receive an options bag larger than the lines it saves? If so, don't extract.
- Does the new module duplicate a helper that lives somewhere else? If so, collapse to one home.
- Does the new module re-decide a strategy that's already decided upstream? If so, the strategy router needs to be the single decision point.

## Naming

- Reserve domain terms for things that match the contract.
- A precomputed buffer with no key/eviction is not a "cache" — call it `prerender*`, `snapshot*`, or whatever it actually is.
- A "store" is for live state. A "registry" is for type-keyed lookup. A "controller" owns a lifecycle. Don't reuse names across roles.

## Anti-patterns

- Extracting a wrapper that only relocates an input bag.
- Extracting a hook that imports its consumer's internals.
- "Adding a type" requires editing the dispatch site instead of the registry.
- A registry without a default entry.
- Per-type logic re-decided inside a strategy consumer.
- Mixing React state, DOM refs, and pure math in the same file.
- Half-extractions with backwards-compat shims.

## Key files

- `src/app/features/playback/usePlaybackController.ts` — feature-hook example.
- `src/app/features/compose/composeDrawing.ts` — pure helpers example.
- `src/app/features/compose/useComposeToolShortcuts.ts` — React-side counterpart.
- `src/app/state/storedAppSettings.ts` — lifted shared module example.
- `src/components/inspector/inspectorRegistry.ts` — per-type registry.
- `src/components/preview/strategies/selectPreviewStrategy.ts` — pure decision function.
- `src/components/preview/render/sceneRender.ts` — render seam.
- `src/components/preview/backends/types.ts` — `RenderBackend` interface.
