# Agent Instructions

## External Memory

- Always start project work with an external memory file at `build/[version number]/memory/[id]-feature-name.md`.
- Example: `build/v0.2.6/memory/001-init-editor.md`.
- After every major added feature, major update, rework, rewrite, or feature addition, populate or update the relevant memory files so future agents can pick up the work.

## Version Planning

- When the user starts a new version with a vision, document it in `build/[version]/PLAN.md`.
- The plan should highlight the focus of the current version, its progress, and the big overarching goals.
- For smaller edits or smaller user commands, do not edit the plan. `PLAN.md` is reserved for tracking progress on major updates.
- When the user bumps the version, update the project and all `AGENTS.md` instructions to create and use a new version folder under `build/`.

## UI And Components

- Always inspect current UI elements before creating a new one.
- Reuse existing components as much as possible.
- Always use shared, themed primitives for UI fundamentals such as checkboxes, dropdowns/selects, text fields, textareas, dialogs, sidebars, popovers, switches, and similar controls.
- If a needed primitive does not exist yet, add it using shadcn as the base, theme it to match Clipper, and then reuse that primitive instead of styling one-off controls inline.
- Do not fall back to default browser components for fundamental UI elements.
- Always use Tailwind CSS utility classes for component styling and layout instead of grouping component styles in a centralized CSS file. Keep CSS files limited to Tailwind imports and minimal global/base rules.
- When the user requests app-wide/global behavior or styling, implement it in the global CSS file instead of repeating Tailwind utilities across components.

## Architecture

- Keep code modularizable.
- Composition source files must use component-oriented TypeScript authoring: `new Composition({ render() { return [...] } })` with renderable classes such as `Component`, `Group`, `Rect`, `Text`, and `Chart`.
- Composition source code is project-owned: look in `project.compositionSources` and the project state/persistence flow, not sidecar `.ts` files. The unified File Manager UI is implemented in `src/components/FileManager.tsx`.
- Composition source should be organized with named `Component` classes, shared constants where useful, and a top-level `Composition` whose `render()` returns those components.
- Do not reintroduce `defineComposition`, `definePart`, `objects`, or `components` as public authoring APIs. The normalized `CompositionClip.objects` array is internal editor/runtime state only, not source authoring style.
- Do not regenerate component-authored source into JSON-style or object-list source. If source generation is unavoidable, emit class/render-based TypeScript.
- The app currently supports desktop only, using Electron and Vite at the latest versions.
- Follow the current open-source project structure to maintain a professional, ready-to-publish organization.
- Prefer small cohesive modules over long mixed-responsibility files. If a file starts combining UI rendering, platform I/O, project mutation, derived calculations, and constants, extract stable seams into `src/app`, `src/core`, `src/components`, or `src/lib` before adding more behavior.
- Keep React components focused on rendering and local orchestration. Move reusable domain logic, project transformations, timeline math, render/runtime behavior, and host/Electron adapters into named modules with narrow public APIs.
- Use scoped Zustand stores/providers for canonical app/editor/project state that must be shared across the app. Do not keep shareable state in `App.tsx` just to avoid store updates; optimize subscriptions instead.
- Avoid deeply nested prop chains for shared feature state/actions. If callbacks or state must pass through multiple unrelated component layers, move them into a scoped Zustand store/provider or a focused controller hook with narrow selector hooks instead of adding more threaded props.
- Prefer narrow selector hooks over broad store subscriptions. Never subscribe a root component to an entire Zustand store when high-frequency state such as scrub time, playback time, drag state, or selection previews can change.
- Suppress no-op store writes and keep store actions semantic where possible. Prefer commands such as `applyEditorState`, `clearMarkerSelection`, or `clearNodeSelection` over repeated raw field updates when behavior has domain meaning.
- Keep transient pointer/rAF machinery local to the owning interaction component or controller, but keep canonical semantic state global when it needs to be shared. If a global high-frequency value needs a render cache, subscribe narrowly and update the cache with `startTransition` rather than making the state local and unshareable.
- Move derived editor models into named selector/helper modules under `src/app/state` or pure helpers under `src/core`; avoid rebuilding large derived trees inline in `App.tsx`.
- Use OOP only for stateful boundaries and service adapters, such as host filesystem/export bridges or long-lived controllers. Keep pure calculations as plain functions in `src/core` so they stay testable and easy to compose.
- Avoid spaghetti control flow: do not add deeply nested conditionals, broad catch-all helpers, hidden global mutations, or unrelated responsibilities to existing functions. Split by domain when a function cannot be understood at a glance.
- Prefer explicit names and exported types at module boundaries. Avoid anonymous object bags for cross-module workflows when a named type would document intent.
- New feature work should include a short architecture note in the version memory file describing where the feature lives, why those module boundaries were chosen, and what should be reused next time.
- When touching legacy large files, leave them smaller or better partitioned when feasible. At minimum, do not make them significantly larger without documenting why extraction is unsafe.
- For drag, resize, scrub, marquee, slider, picker, and pointer-move interactions, default to rAF-throttled transient previews. Avoid project writes, persistence writes, expensive derivations, and broad React/Zustand updates during movement.
- Prefer imperative DOM/CSS previews (`transform`, `translate3d`, opacity, width/height variables, targeted refs). Commit canonical app/project state once on release, pointer up/cancel, blur, pause, or another explicit finalization event.
- Do not call project-mutating callbacks from every pointer-move frame unless unavoidable. If unavoidable, throttle, deduplicate, and keep changed state narrow.
- Preserve existing drag constraints while optimizing previews: snapping, clamping, no-overlap rules, selection semantics, mended marker chains, and final committed positions/sizes must still be computed from the same canonical logic.
- For live render, camera, motion, effect, or animation previews, use `src/core` helpers to compute deterministic preview values, then apply only the affected DOM/CSS property with rAF. Keep labels/readouts local and reuse `build/v0.2.6/memory/001-motion-timeline-layers.md` for timeline motion layer patterns.
