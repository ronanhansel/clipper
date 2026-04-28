# System Font Dropdown

## Goal

Replace the inspector font dropdown's static list with fonts discovered from the host system at runtime.

## Architecture Note

- Font discovery belongs in the Electron host boundary because the renderer should not depend on OS-specific filesystem or command execution details.
- The preload bridge exposes a narrow `listSystemFonts()` API that returns display family names only.
- The inspector keeps a small fallback list for loading/failure states, but merges host fonts into the dropdown and preserves any currently selected project font even if it is unavailable on the current machine.

## Implementation

- `electron/main.ts` caches enabled macOS font families from `/usr/sbin/system_profiler SPFontsDataType -json` behind `clipper:list-system-fonts`; the absolute path avoids GUI app `PATH` issues and streamed output avoids `execFile` buffer limits.
- `src/app/clipperHost.ts` now tries Chromium's `queryLocalFonts()` first, matching the browser-side registry approach used by tools like Penpot more closely for local availability. Electron explicitly allows the `local-fonts` permission on the app session.
- `electron/preload.cts`, `src/vite-env.d.ts`, and `src/app/clipperHost.ts` expose the API to React.
- `src/components/inspector/InspectorPanels.tsx` loads the system font options once per renderer session and renders them in `FontSelector`.

## Verification

- `npx tsc -p tsconfig.node.json --noEmit` passes.
- `npx tsc --noEmit` passes for the renderer after the local-font API types were added.
- Full `npm run typecheck` is currently blocked by existing `src/App.tsx` errors for missing `CodeViewportState` and possibly undefined `currentViewportState`.

## Follow-up

- Reuse `clipperHost.listSystemFonts()` for any future typography panels instead of adding component-local OS discovery.
