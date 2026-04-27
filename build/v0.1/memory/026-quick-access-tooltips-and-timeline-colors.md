# Quick Access Tooltips And Timeline Colors

## Summary
- Added a local shadcn-style tooltip primitive at `src/components/ui/tooltip.tsx` backed by `@radix-ui/react-tooltip`.
- Wrapped the right-side quick access icon controls with compact feature popups, including the requested `Magnetic scrub` and `Snap selector` names.
- Added the same tooltip treatment to the player controls, with visible shortcut chips for every player and quick-access button.
- Shortcut chips use readable text labels rather than symbolic Unicode glyphs.
- Added keyboard handling for `Home`, `End`, `Left Arrow`, `Right Arrow`, `C`, `M`, `S`, and `R` to match the displayed shortcut labels.
- Clicking empty frame/timeline lane space clears selected part/object/marker state so the inspector shows a no-selection empty state.
- Timeline horizontal scrolling now reserves visible scrollbar space by removing extra bottom padding from the timeline grid and forcing a visible `timeline-scrollbar` horizontal rail.
- Removed monospace styling from the playback timer and timeline zoom percentage while retaining tabular number alignment.
- Restored gradients for timeline items: translate teal, zoom yellow, parts green, and blank spacers dark gray.
- Scrubbing near or beyond the visible timeline edges now auto-scrolls the horizontal timeline viewport so the playhead remains visible while dragging outside the current view.
- During active scrub drags, pointer positions outside the timeline viewport are clamped to the visible left/right edge for time calculation, keeping the playhead anchored to the edge while the timeline scrolls underneath.
- Tooltip popups use a delayed reveal and short fade/slide/scale animation instead of appearing instantly.
- Magnetic scrub now changes the scrub/playhead color instead of outlining all timeline lanes.
- Removed purple from zoom timeline markers/focus-picking accents. Zoom markers now use yellow, while parts use green to keep timeline categories visually distinct.

## Notes
- The project has no `components.json`, so the tooltip primitive was added manually in the same style as the existing local shadcn primitives.
- `@radix-ui/react-tooltip` was added to `package.json` and `package-lock.json`.
