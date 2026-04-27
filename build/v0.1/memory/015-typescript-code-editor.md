# TypeScript Code Editor

## Context

- User asked why the code syntax looked strange and wanted correct syntax highlighting plus direct TypeScript editing support.
- Root cause was twofold: the code pane used a plain `textarea`, and the sample project stored motion snippets as strings while actual `clipper/projects` part files were placeholder objects.

## Changes

- Added Monaco editor packages and replaced the code pane textarea with Monaco configured for TypeScript diagnostics, TSX compiler mode, bracket coloring, word wrap, and automatic layout.
- Added a custom `clipper-dark` Monaco theme so the editor matches the app's graphite surface, cyan cursor/accent, muted gutters, and existing scrollbar treatment.
- Added `clipper/projects/part-api.ts` with a small typed `definePart` API for project-authored part files.
- Rewrote the sample part files to be valid typed TypeScript sources using structured `motion` objects instead of pseudo string snippets.
- Included `clipper/projects/**/*.ts` in the root TypeScript project so sample part files are directly typechecked.

## Notes

- The preview still uses the in-memory `sampleProject` manifest model. Editing and saving part files now works with real TypeScript source, but a future runtime loader is needed for saved TS files to drive the preview live.
