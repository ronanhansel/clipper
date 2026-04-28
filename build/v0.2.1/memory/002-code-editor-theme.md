# Code Editor Theme

## Context

- User reported the TypeScript code editor theme was visually too intense, with saturated red blocks around much of the source.

## Changes

- Kept the embedded Monaco `clipper-dark` theme features and original syntax color palette intact.
- Added explicit invalid-token rules so Monaco does not render bright red filled blocks behind large portions of TypeScript source.
- Diagnostic backgrounds are transparent while error/warning foregrounds remain visible.
- Replaced the active/inactive Monaco text selection colors with subdued graphite-blue fills so selected code does not appear as a bright red block.
- Replaced Monaco bracket-pair and matching-bracket colors with subdued cyan, amber, green, violet, blue, and graphite tones to avoid red cursor-adjacent bracket flashes.

## Architecture Notes

- The editor theme remains colocated with `CodePane` because it depends on runtime CSS accent variables from `getClipperAccent()`.
- Reuse the existing Monaco theme path for future editor visual changes; behavior and persistence are unchanged.
