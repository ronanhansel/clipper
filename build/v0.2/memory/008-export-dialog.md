# Export Dialog

## Context

- Started v0.2 export work from the top app bar `Export` action.
- Recordly reference at `.temp/referenced/Recordly/src/lib/exporter/videoExporter.ts` uses a much larger WebCodecs/FFmpeg pipeline; Clipper does not yet have a frame renderer/export encoder pipeline.
- First implementation should provide a polished shadcn/Radix export dialog and a desktop save bridge so users can export project media data immediately.

## Notes

- Current Electron bridge only supports restricted text read/write under `clipper/`.
- Export output is planned as a JSON media package containing project, scene, timeline, dimensions, duration, validation state, and source metadata.
- Future rendered video/image export can reuse the dialog shape and replace the JSON export action with the eventual renderer pipeline.

## Implementation

- Added `src/components/ui/dialog.tsx`, a shadcn/Radix-style dialog primitive themed to Clipper.
- Added `@radix-ui/react-dialog`.
- Added `clipper:export-media-file` IPC using Electron `showSaveDialog` and exposed it through preload.
- Added an Export dialog from the top toolbar with format selection, source inclusion toggle, export stats, and JSON media package saving.
- Browser fallback downloads the export as a JSON file if Electron bridge is unavailable.

## Update

- Export dialog now has two tabs: `Export media` and `Export project`.
- `Export project` owns JSON project/scene package output.
- `Export media` renders the current preview frame to a full-resolution PNG file, applying active zoom and pan markers at the playhead.
- Added `clipper:export-binary-file` IPC for rendered binary output.
- Top toolbar export button was reduced and rethemed to the Clipper blue/neutral toolbar style.

## Verification

- `npm run typecheck` passes.
- `npm run build` passes; Vite still reports the existing large chunk warning.
