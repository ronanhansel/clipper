# Agent Instructions

## External Memory

- Always start project work with an external memory file at `build/[version number]/memory/[id]-feature-name.md`.
- Example: `build/v0.3/memory/001-init-renderer.md`.
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
- The app currently supports desktop only, using Electron and Vite at the latest versions.
- Follow the current open-source project structure to maintain a professional, ready-to-publish organization.
- For drag, resize, scrub, marquee, slider, picker, and pointer-move interactions, default to non-continuous state updates: avoid project writes, persistence writes, expensive derivations, and broad React state updates during movement.
- Use rAF-throttled transient previews during movement. Prefer imperative DOM/CSS-variable previews such as `transform`, `translate3d`, width/height variables, or refs for high-frequency visual feedback.
- Commit canonical app/project state once on release, pointer up/cancel, blur, or another explicit finalization event. Keep any live state updates minimal, deduplicated, and only for semantic changes the user must see during the drag.
- Do not repeatedly call callbacks that mutate project state from every pointer-move frame unless there is a concrete reason that cannot be represented as a transient preview. If unavoidable, throttle, deduplicate by value, and keep the changed state as narrow as possible.
- Preserve existing drag constraints while optimizing previews: snapping, clamping, no-overlap rules, selection semantics, mended marker chains, and final committed positions/sizes must still be computed from the same canonical logic.
