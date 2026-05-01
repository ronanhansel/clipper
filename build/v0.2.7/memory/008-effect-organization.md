# Effect Organization

## Goal
- Add manifest-owned grouping metadata for motion and adjustment effects.
- Present groups as folder-style sections in the Effects tools panel.
- Groups are authored in effect manifests only; the app does not support creating, editing, or reordering groups/effects at runtime.

## Architecture Notes
- Effect grouping should live on the shared effect package definition so registry consumers can organize packages without hard-coded effect IDs.
- Group paths use `/` separators, e.g. `Scale/Focus` or `Overlay/Film`.
- UI grouping should be derived from package order and group paths, preserving manifest order within folders.

## Implemented
- Added required `group: string` metadata to motion and adjustment effect definitions.
- Assigned built-in motion groups: `Scale` and `Disposition`.
- Assigned built-in adjustment groups: `Timing`, `Visual`, and `Overlay`.
- Updated the Effects tools panel to build a static nested folder tree from package `group` paths.
- Added a registry-level test assertion that installed effect packages have non-empty group path segments.
- Reworked built-ins to use one folder per effect with data-only `manifest.yml` files and TypeScript `logic.ts` behavior files, e.g. `motion/zoom/manifest.yml` plus `motion/zoom/logic.ts`.
- Added a core manifest adapter that imports `manifest.yml?raw`, parses the package metadata, and attaches the effect's logic object in the built-in family index.
