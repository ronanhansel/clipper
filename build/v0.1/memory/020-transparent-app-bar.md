# Transparent App Bar

- Updated the Electron window chrome to use a transparent macOS title bar.
- The change targets the native app bar with the traffic-light controls rather than the React header controls.
- Window content keeps the existing dark app background.
- Made the React top header an Electron drag region so users can hold it to move the window.
- Marked header action buttons as non-draggable so they remain clickable.
