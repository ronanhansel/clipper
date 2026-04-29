# Consolidated Colour Adjustments

## Goal
- Remove standalone Brightness, Contrast, Saturation, and Hue Rotate entries from the Effects panel.
- Keep Colour Grade as the single colour adjustment entry while preserving all four controls.

## Architecture Notes
- `src/core/effects/builtins/adjustments/colourGrade` already owns brightness, contrast, saturation, and hue params plus combined CSS filter application.
- The standalone effect folders were left in place, but their packages are no longer imported, exported, or included in `builtInAdjustmentEffects`.
- Registry consumers and the Effects panel now expose only `clipper.adjustment.colourGrade` under the Colour group.
- Colour Grade controls now use conventional editor offsets for brightness, contrast, and saturation: `0` is neutral and `-100..100` maps to CSS filter multipliers `0..2`; hue remains degrees at `-180..180` with `0deg` neutral.
