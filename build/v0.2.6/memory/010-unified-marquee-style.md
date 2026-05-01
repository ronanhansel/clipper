# Unified Marquee Style

## Status

Implemented a focused visual consistency update for marquee selection boxes.

## Implemented

- File Manager marquee selection now matches the editor marquee: square `#159dff` border, 10% blue fill, and subtle blue outer shadow.
- Timeline lane marquee selection now uses the same editor marquee styling and square corners instead of the previous themed rounded box.
- Behavior and selection math were left unchanged.

## Architecture Notes

- The change stays in the existing render components, `FileManagerMarquee` and `TimelineSelectionBox`, because this is a narrow visual alignment and both components already own their marquee DOM.
- If another marquee surface is added, reuse the editor visual recipe: `border-[#159dff] bg-[#159dff]/10 shadow-[0_0_0_1px_rgba(21,157,255,0.18)]`.
