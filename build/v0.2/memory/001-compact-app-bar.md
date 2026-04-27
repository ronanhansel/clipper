# Compact App Bar

- Collapsed the app header title metadata from two centered lines into one compact baseline row.
- Reduced the main app bar grid row from `64px` to `48px`.
- The visible title is `project.name`; for the sample project this is `Agentic Motion Primer`. Scene and part context remains visible inline as `Opening Sequence / Grid Reveal`.
- The app title now has a right-click context menu with `Rename project`, switching the title into an inline input that updates `project.name` through normal project history/state.
- App bar action buttons use compact app-bar-only classes (`text-xs`, reduced padding, tighter gaps) rather than the larger shared `buttonBase` used elsewhere.
- `DESIGN.md` now specifies muted charcoal (`#12141A`) as the default app background direction instead of pure black; true black should be reserved for media/content previews.
- Implemented the muted charcoal theme in the app shell: global/body background, main grid, header, sidebars, center editor well, controls strip, asset wells, agent/code panels, Monaco editor background, and form primitives now avoid near-black defaults.
- App bar action order is `Presets`, `Preview`, `Export`, `Save`, placing Save at the far right.
