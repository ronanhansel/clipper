# Master Save Project State

- App startup now loads `clipper/projects/prj_v01_sample/project.json` as the canonical project state.
- The app-bar Save button is the master save path for project, timeline, inspector, and active code-editor changes.
- Active code-editor saves run before project manifest persistence so source edits can refresh the in-memory project before `project.json` is written.
- The Save button dirty state includes project changes and active code-editor changes.
