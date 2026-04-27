# Continuous Focus Picker Drag

- Updated the interactive frame focus picker for zoom markers and pan markers to support click-and-drag picking.
- Pointer down now captures the pointer, immediately applies the current frame point, keeps updating marker `x`/`y` values on pointer move, and keeps pick mode active after pointer up.
- The behavior is implemented in `src/App.tsx` with shared frame picker helpers so zoom focus and translation target picking stay consistent.
- Follow-up: the inspector crosshair buttons are now true toggles. Click/drag updates keep pick mode active after pointer up, and clicking the active crosshair button again exits pick mode.
- Follow-up: simplified the frame picker overlay from a crosshair target to a small modern dot.
