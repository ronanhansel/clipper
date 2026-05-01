# Transparent Scrollbars

- Updated the editor scrollable surfaces to avoid native white scrollbar tracks on dark panels.
- Scrollbar styling now lives globally in `src/styles.css` under `@layer base` instead of component-level Tailwind arbitrary variants.
- Firefox is covered with `scrollbar-color`; Chromium/Electron is covered with global `::-webkit-scrollbar` selectors.
- Scrollbar tracks and corners are transparent app-wide, with rounded translucent thumbs.
