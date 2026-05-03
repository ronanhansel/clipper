# Clipper App Icon

`icon-iOS-Default-1024x1024@1x.png` is the source of truth for the flattened app icon. It is exported from Apple Icon Composer and includes the static Liquid Glass appearance intended for cross-platform use.

Run `npm run icons:generate` after replacing the exported PNG. The script regenerates:

- `build/icons/icon.png`
- `build/icons/icon.icns`
- `build/icons/icon.ico`
- `build/electron/icon.png`
- `build/electron/icon.icns`
- `build/electron/icon.ico`
- `public/icon.png`

The generated assets are used by Electron dev mode, packaged macOS/Windows/Linux builds, and the browser favicon. Keep `build/electron` as the Electron Builder resource directory so packaging only sees finalized platform assets.
