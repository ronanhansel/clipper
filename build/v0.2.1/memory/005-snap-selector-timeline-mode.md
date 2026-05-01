# Snap Selector Timeline Mode

## Goal

Make snap selector respect the active timeline mode instead of selecting hidden Direct-mode marker lanes while the editor is showing the Edit timeline.

## Architecture Note

The snap selector is local timeline interaction state in `TimelinePanel` inside `src/App.tsx`. Its hit testing now branches at the selection boundary: Edit mode selects the current composition block only, while Direct mode keeps using the existing topmost timeline item helper so pan and zoom markers remain selectable there.

Future timeline-mode-specific selection behavior should stay in this boundary instead of changing shared timeline lookup helpers, because marker hit-testing is still correct for Direct mode.

## Implemented

- `selectTimelineItemAtTime` now selects only the active part when `TimelinePanel` is in Edit mode.
- Direct mode continues to prioritize translation markers, zoom markers, then parts at the scrubber time.
