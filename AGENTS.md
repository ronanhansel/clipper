# Agent Instructions

## External Memory

- Always start project work with an external memory file at `build/[version number]/memory/[id]-feature-name.md`.
- Example: `build/v0.2/memory/001-init-editor.md`.
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
- For drag/pointer-move interactions, avoid project writes and broad React state updates during movement; use rAF plus transient/imperative previews, then commit once on release.
