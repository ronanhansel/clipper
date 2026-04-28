# Strict Component Composition Authoring

## Status

- In progress for v0.2.5.

## Goal

- Make the slide 01 / slide 02 component-oriented TypeScript format the only supported composition authoring format before deployment.
- Remove legacy JSON/object-list authoring APIs instead of carrying compatibility shims.
- Keep the editor's normalized `FrameObject[]` model as an internal runtime/editing layer only.

## Architecture Note

- Public composition source files must export `new Composition({ ... render() { return [...] } })` and use renderable classes such as `Component`, `Group`, `Rect`, `Text`, and `Chart`.
- `defineComposition`, `definePart`, `objects`, and `components` are authoring-layer breaking changes and should not be reintroduced unless a future migration layer is explicitly requested.
- Removed the legacy `@clipper/part-api`, public `Part`/`ClipPart` aliases, and `export const part` loader fallback. Composition source must import from `@clipper/composition-api` and export `const composition`.
- If source must be generated from internal project state, it must emit class/render-based TypeScript and must not emit object-list or JSON-style authoring.
- Removed hardcoded app and CLI defaults to projects under `clipper/projects`. That directory is user/workspace project data and should not be treated as maintained source fixtures.
- The app now uses a minimal in-memory fallback project only when no stored project can be loaded.
