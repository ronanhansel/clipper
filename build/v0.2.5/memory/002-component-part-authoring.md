# Component Part Authoring

## Status

- In progress for v0.2.5.

## Goal

- Replace hard-to-maintain serialized HTML/template strings with normal TypeScript authoring primitives.
- Let part files define classes, components, groups, and renderable objects directly.
- Preserve the existing editor/runtime `FrameObject` model as the normalized execution layer.

## Architecture Note

- The authoring API belongs in `clipper/projects/part-api.ts` because project files import `@clipper/part-api` and Monaco already maps that package path.
- Public authoring language now uses `Composition` and `export const composition`. Legacy `defineComposition`, `definePart`, `objects`, and `components` authoring were removed before deployment.
- Class/component authoring should normalize to plain source objects before entering editor state so preview, selection, inspector, timeline, and existing persistence can continue to use the current data model.
- Groups should support shared transform/style/motion by applying inherited presentation to child renderables during recursive resolution.
- Dynamic component rendering needs a source-backed resolver so preview/export can ask part source code for renderables at a specific frame time instead of relying on one-time source hydration.

## Implementation Notes

- Added `Composition`, `Component`, `Group`, primitive renderables, `Transform`, and expanded motion transform support to the part API.
- `Group` inherits style, motion, and transform into recursively resolved children.
- Source evaluation accepts `export const composition` with `new Composition({ render() { ... } })` only.
- Generated source must emit class/render-based TypeScript and must not emit object-list source.
- Migrated the white serif demo source files to component-authored compositions.
