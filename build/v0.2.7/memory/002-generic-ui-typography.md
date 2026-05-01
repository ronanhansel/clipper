# Generic UI Typography

## Summary
- Removed the prominent all-caps and expanded letter-spacing treatment from shared UI labels.
- Switched the app shell to generic system fonts instead of naming Inter.
- Reworded visible shorthand such as `BG` and default `MOTION` layer names to title/sentence-case labels.

## Architecture Note
- Typography defaults live in `src/styles.css` for the global app font stack.
- Reusable UI label treatments live in `src/app/config.ts` through `sectionTitle` and `mutedCaps`; future inspector or panel labels should reuse these instead of adding one-off uppercase/tracking classes.
