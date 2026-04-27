# Select Dropdown Cursors

## Context

- User requested all dropdown/select template content show the selectable cursor instead of the default cursor.
- The shared Radix select primitive in `src/components/ui/select.tsx` used `cursor-default` on menu items and scroll buttons.

## Implementation

- Updated the shared `SelectTrigger`, `SelectContent`, scroll buttons, and `SelectItem` classes to use `cursor-pointer`.
- Disabled trigger styling still keeps `disabled:cursor-not-allowed`.
