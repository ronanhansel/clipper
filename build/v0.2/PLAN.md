# Clipper v0.2 Plan

## Vision

Clipper v0.2 polishes the editor into a complete desktop authoring experience. The focus is turning the v0.1 prototype into a more coherent workflow with reliable timeline selection, cleaner panels, reusable controls, and less redundant chrome.

## Product Focus

- Make timeline interactions consistent with the visual stack so the top-most block is selected first.
- Clamp persisted and displayed numeric floating point values to at most two decimal places.
- Replace the left utility sidebar with a file manager and a dedicated tools tab.
- Move agent-facing snapshot and context into the right-side Agent tab.
- Introduce reusable polished controls, starting with a throttled floating color selector.

## Current Status

- v0.2 vision captured.
- Initial polish pass in progress.

## Testing Scenarios

- Snap selector selects pan blocks above zoom blocks and parts when the playhead overlaps them.
- Project saves do not emit long floating point tails.
- Left panel supports asset renaming, folder creation, drag import, and ordering.
- Top toolbar no longer duplicates timeline tools.
- Right Agent tab contains Snapshot and Agent Context.
- Color picker updates interactively without flooding project state while dragging.
