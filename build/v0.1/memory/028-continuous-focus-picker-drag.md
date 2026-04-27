# Continuous Focus Picker Drag

- Updated the interactive frame focus picker for zoom markers and translation markers to support click-and-drag picking.
- Pointer down now captures the pointer, immediately applies the current frame point, keeps updating marker `x`/`y` values on pointer move, and exits pick mode on pointer up or cancel.
- The behavior is implemented in `src/App.tsx` with shared frame picker helpers so zoom focus and translation target picking stay consistent.
