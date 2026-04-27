# Global Button Focus Halo

## Summary

- Added a global base CSS rule in `src/styles.css` to remove native browser focus outlines and box shadows from `button` and `[role="button"]` controls.
- This prevents the default browser halo from appearing around app buttons after keyboard interactions such as `Tab`, `Shift`, or `Space`.

## Notes

- Text inputs, textareas, and selects keep their existing themed focus styling.
- App-authored selection outlines, such as selected timeline or frame-object states, are unchanged because the rule only targets focused button controls.

## Follow-up

- Also disabled text selection globally by default via `:root { user-select: none; }`.
- Editable fields, contenteditable regions, and Monaco editor content are opted back into `user-select: text` so editing and code selection continue to work.
