# Timeline Mend Edge Color

## Status

Changed mended edge indicators away from pink while keeping timeline block gradients.

## Implemented

- Changed zoom and translation mended edge indicators from pink to a teal vertical gradient, matching the teal transition styling shown in the reference while staying visually consistent with gradient timeline markers.
- Restored timeline gradients for adjustment blocks, composition clips, motion blocks, and effect drag previews after user clarification.
- Split edge styling so standalone snap-in/snap-out edges use a pink vertical gradient, while true mended adjacent edges use the teal vertical gradient.

## Architecture Notes

- The change is presentation-only and remains scoped to timeline rendering. No marker state, snapping logic, or mending behavior changed.
