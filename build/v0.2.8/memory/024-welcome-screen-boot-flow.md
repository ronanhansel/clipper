# Welcome Screen & App Boot Flow

## Summary

Replaced the bare "No project loaded" error screen with a proper `WelcomeScreen` component that supports creating new projects, opening existing ones, and browsing recent projects. Added window bounds persistence across launches.

## Architecture

### Welcome Screen (`src/components/WelcomeScreen.tsx`)
- Renders when `isWelcome === true` or `bootError !== null` in `App.tsx`
- Three actions: Create New Project, Open Existing Project, recent projects list
- Uses the same dark theme palette (`#12141a` background, `#dfe2ea` text) and `--clipper-accent` tokens

### Boot Flow (`src/app/project/useActiveProjectBoot.ts`)
- `readStoredActiveProjectManifestPath()` now returns `null` instead of throwing when no path is stored
- `isWelcome` state: set to `true` when the stored path is absent (first launch or after close-project)
- `recentProjects` state: loaded from `app-state.json` via `readRecentProjects()` on mount
- `closeProject()`: clears stored path, resets boot state, triggers welcome screen
- `createNewProject()`: opens save dialog → scaffolds minimal project via JSZip → loads it
- `openRecentProject()`: loads a project from the recent list by path

### App State (`src/app/project/activeProjectManifest.ts`)
- `readAppState()` / `writeAppState()`: generic read/write helpers for `clipper/app-state.json`
- `readRecentProjects()` / `addRecentProject()` / `removeRecentProject()`: manage `recentProjects` key
- `clearStoredActiveProjectManifestPath()`: removes path from both localStorage and app-state.json
- Recent projects are capped at 10, deduplicated by path, most-recent-first

### Window Size Persistence (`electron/main.ts`)
- `readAppState()` / `writeAppState()` in main process (uses Node `fs` directly)
- On `createWindow()`: reads `windowBounds` from app-state, validates against `screen.getAllDisplays()`, applies via `setBounds()` if on a visible display
- On window `close`: `event.preventDefault()` → async write bounds → `window.destroy()` ensures bounds are saved before the window is destroyed
- `window-all-closed` now always calls `app.quit()` (platform-agnostic, including macOS)

### Create Project IPC
- `clipper:create-project-dialog` (main.ts) opens a save dialog for `.clipper` files
- Exposed via preload (`createProjectDialog()`)
- Renderer uses JSZip to scaffold a minimal `.clipper` with `project.json` + timeline entries

### Close Project Button (`src/app/shell/AppHeader.tsx`)
- New "Close" button between "Open" and "Settings"
- `handleCloseProject()` in `AppContent` awaits `saveAllChanges()` if dirty, then calls `closeProject()`
- Header grid changed from `430px` to `500px` right column to accommodate the extra button

## Reuse Notes
- For any future app-level preferences, use `writeAppState()` in `activeProjectManifest.ts` (renderer) or `writeAppState()` in `electron/main.ts` (main process)
- The `WelcomeScreen` component takes `error`, `recentProjects`, `onCreateNewProject`, `onOpenProject`, `onOpenRecentProject` callbacks — extend by adding new props
- When adding new IPC handlers, follow the existing pattern: handler in `electron/main.ts`, bridge in `electron/preload.cts`, service method in `src/app/clipperHost.ts`, type in `src/vite-env.d.ts`
