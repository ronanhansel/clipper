# 019 Shared Form Primitives

## Context

- User requested replacing existing text fields, checkboxes, and dropdowns with reusable shadcn-based themed primitives.
- The project did not have `components.json` or existing `src/components/ui` primitives, so local shadcn-style primitives were added directly.

## Work Log

- Added `src/lib/utils.ts` with a `cn` helper using `clsx` and `tailwind-merge`.
- Added themed primitives under `src/components/ui`: `Input`, `Textarea`, `Checkbox`, and `Select`.
- Added Radix dependencies for checkbox/select primitives.
- Replaced inspector inline/default `input`, `textarea`, `select`, and checkbox controls in `src/App.tsx` with the shared primitives.
- Verified remaining raw `input`/`textarea` usage is confined to the primitive implementation files.

## Verification

- `npm run typecheck` passes.
- `npm test` passes.
- `npm run build` passes, with the existing Vite large chunk warning for the TypeScript editor bundle.
