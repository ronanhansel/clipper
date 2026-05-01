# v0.2.6 File Manager Focus Highlight

## Goal

Stop the file manager from showing the first item as highlighted after clicking outside the panel.

## Changes

- Updated `src/components/FileManager.tsx` so row focus styling only applies while the Arborist tree actually has DOM focus.
- Suppressed default pointer focus on empty tree-area clicks so Arborist does not focus its first row when the user is only clearing selection.
- Selection highlighting is unchanged; selected rows still render with the existing highlighted background.

## Architecture Notes

- The fix stays inside the file manager row renderer because the issue was visual state coupling: Arborist can retain or reset a focused node even after selection is cleared.
- Future file-manager focus behavior should keep selected state and keyboard-focus state distinct so background/outside clicks do not look like item selection.
