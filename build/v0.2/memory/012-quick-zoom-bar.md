# Quick Zoom Bar

- Added a right-side quick app bar Search button that toggles an anchored zoom control above the button.
- The floating control is compact rather than full width, right-aligned to the Search button, and includes a percentage label, range slider, and minus/plus zoom buttons.
- The control drives the interactive frame preview scale, replacing the previous fixed preview scale path with a state-backed scale passed into preview overlays and drag math.
- Closing the Search control resets the preview scale to the default centered view so both zoom and placement return to normal.
- The middle preview area, not the frame itself, scrolls when zoomed in. The frame remains a static rendered canvas while the surrounding workspace handles overflow.
- The Search/zoom toggle sits at the rightmost end of the quick app bar controls.
