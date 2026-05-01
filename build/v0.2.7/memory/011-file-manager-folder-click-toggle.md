# File Manager Folder Click Toggle

## Goal
- Make File Manager folders open and close with one plain click on the folder row, matching the Effects panel folder behavior.

## Architecture Notes
- Folder toggling lives in `FileManagerTreeRow`, the shared react-arborist row click boundary, so selection and activation stay centralized.
- The existing chevron button still stops propagation and toggles independently, preventing double toggles when clicking the disclosure icon.
- Modified-click multi-selection is preserved by only row-toggling folders for unmodified clicks.

## Implemented
- Added single-click folder toggling after the row's normal `node.handleClick` selection handling.
- Removed the custom double-click-only folder toggle handler from `UnifiedTreeNode`.
