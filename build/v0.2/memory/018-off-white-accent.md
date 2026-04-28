# 018 Off-White Accent

## Summary
- Replaced Clipper's primary blue accent direction with a warm off-white accent.
- Updated `DESIGN.md` to describe off-white selection and creation states instead of blue.
- Rethemed hardcoded blue accent usages in the app shell, shared form primitives, Monaco theme, sample project, and timeline selection states.

## Notes
- Kept non-brand timeline category colors such as green, yellow, and teal/cyan where they communicate distinct editing states.
- Accent colors now live in `src/styles.css` as CSS variables (`--clipper-accent`, `--clipper-accent-rgb`, `--clipper-accent-foreground`, and related hover/strong/badge variants) so future palette changes are centralized.
- Timeline selected marker halos, including zoom markers, use `--clipper-accent` so pan, zoom, and composition selections stay visually consistent.
