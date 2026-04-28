# Deterministic Template Runtime

Work started to make code-authored frames playback-safe and export-faithful.

Goals:
- Share deterministic frame evaluation between editor preview and Electron export.
- Treat visible frame items as ordered layers evaluated from explicit time input.
- Support code-backed HTML templates without relying on live CSS/browser animation timing.
- Keep preview smooth by only changing canonical project state on explicit edits, not during playback ticks beyond current time.

Implemented:
- Added `FrameTemplate` and a `template` frame object type. Template source is persisted as a string that evaluates to a function receiving `{ time, duration, progress, frame, object }`.
- Added `src/core/renderRuntime.ts` for deterministic object/background evaluation, motion evaluation, template compilation, and preview invalidation flags.
- Preview now evaluates objects through the render runtime before drawing. Static templates can opt out of playback-time invalidation with `template.static`.
- Preview template failures render an in-frame error card instead of crashing the editor surface.
- Electron export now evaluates the same template contract during frame-by-frame capture, including HTML/SVG/template content without escaping.
- Electron export caches compiled template functions across frames for smoother frame stepping.
- Added a sample `deterministic-template-clock` object in `prt_grid_reveal.ts` and the bundled fallback sample project.
- Added render-runtime tests for time-driven template output and static-template invalidation behavior.

Verification:
- `npm run typecheck`
- `npm test`
- `npm run build`
