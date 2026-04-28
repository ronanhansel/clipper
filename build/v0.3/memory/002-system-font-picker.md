# System Font Picker

## Summary
- The text object inspector font dropdown now lists installed system font families instead of a small hardcoded set of CSS stacks.
- Electron main exposes `clipper:list-font-families`, cached per app run, through the preload bridge as `window.clipper.listFontFamilies()`.
- Renderer fallback uses `window.queryLocalFonts()` when available, otherwise a small real-family fallback list.

## Implementation Notes
- macOS discovery uses `system_profiler SPFontsDataType -json` and reads `typefaces[].family` values, falling back to top-level font names if needed.
- Windows discovery uses `System.Drawing.Text.InstalledFontCollection` through PowerShell.
- Linux discovery uses `fc-list : family`.
- The dropdown displays real family names directly. Existing CSS stack values are preserved if already stored on an object, but their dropdown label is reduced to the first non-generic family name rather than labels like `Inter / System`.

## Verification
- `npm run typecheck`
