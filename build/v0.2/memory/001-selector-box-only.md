# Selector Box Only

## Context

- User requested the canvas selector show only the selection box with no additional text labels.
- Screenshot showed a blue outlined selection box with extra text badges such as `home` and `MOVE`.

## Goal

- Remove non-essential text labels from the selector overlay while preserving the selection outline and interaction affordances.

## Implementation

- Removed the selected object badges from `FrameObjectView` in `src/App.tsx`.
- Selected objects now render only the existing blue outline/box styling, with no object-id label or `move` label.

## Text Editing Update

- Added Figma-style double-click editing for selected text objects in the frame preview.
- Text edit mode uses a focused `contentEditable` surface and commits changes on blur, Cmd/Ctrl+Enter, or Escape.
- Extended `ObjectInspector` with text-only controls for content, colour, font family, font size, weight, bold, italic, line height, character spacing, alignment, and box bounds.
- Flattened text controls into the normal inspector flow, removed the nested `Text` card header, and replaced style/alignment text controls with lucide icon buttons including strikethrough.
- Replaced marker-based inline formatting with stored rich text segments. The inspector `Content` field is raw text only and clears segment formatting when edited.
- Inline frame editing preserves per-segment bold, italic, and underline formatting from the contentEditable surface when the user clicks outside. Added an underline icon button to whole-object text style controls.
- Fixed rich text display/edit WYSIWYG line-height by rendering segments inside one `whitespace-pre-wrap` text block instead of as separate flex children.
- Fixed unbold/unitalic/ununderline persistence for text objects with bold base styles by explicitly rendering saved rich text segments with normal style overrides when their segment flags are false.
- Improved rich-text capture by normalizing the contentEditable DOM before commit and reading explicit per-node formatting flags relative to the object base style, so Ctrl/Cmd+B unbold inside a bold object persists after blur.
- Replaced browser-default contentEditable bold/italic/underline shortcuts with deterministic Ctrl/Cmd+B/I/U handlers that wrap the selected range in explicit inline spans, ensuring the saved rich text matches edit-mode visuals.
- Fixed in-app click-away commits by adding a native capture-phase pointerdown listener while inline text editing is active. This commits rich text before app-level selection clearing can unmount the editor.
- Added app-level outside-frame pointer handling to clear object/marker selections when the user clicks outside the frame, excluding Monaco code editor clicks.

## Unified Edit Source Of Truth

- Added `partToSource(part)` in `src/core/partSource.ts` and `richText` support in source parsing/types.
- Interactive edits now sync changed parts into an in-memory `partSources` map, so the Code pane reflects object movement, text edits, and inspector edits immediately.
- Code pane no longer has its own Save button or dirty state. Edits in Monaco apply to the interactive preview immediately via `partFromSource`.
- App Save is now the only persistence action: it writes `project.json` plus all known/generated part source files.

## Full-Opacity Selector Update

- Moved the active frame selector out of the selected object element and into an independent overlay layer in `FramePreview`.
- Removed selected-object outline styling from `FrameObjectView`, so object-level opacity/filter styles no longer affect the selector box.
- The active selector box has no transition and appears immediately; object drag previews imperatively translate the selector overlay alongside selected objects until commit.
- Marquee selection no longer updates selected-object React state during pointer movement; it only previews the raw drag rectangle and commits selected objects on release. This avoids lag and prevents ghost/double selectors while dragging.
- Added an active marquee ref guard plus window-level pointer release fallback so pending rAF drag updates cannot restore the raw drag rectangle after release.
- The committed selection overlay now renders each selected object's own bounds instead of the union `selectionBox`, so releasing a marquee shows object bounding boxes rather than a marquee-sized frame. Object-drag preview transform application now targets all rendered selection boxes.
