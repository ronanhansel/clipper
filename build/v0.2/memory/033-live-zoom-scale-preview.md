# Live zoom scale preview

- Added a transient live preview state for the zoom marker scale slider in `src/App.tsx`.
- Slider movement now updates the local inspector label immediately and rAF-throttles a selected-marker scale override into the frame preview, so users can see the zoom level while dragging.
- Canonical project state is still committed through `updateZoomMarker` only on release/key/blur via `commitScale`, then the transient preview is cleared.
