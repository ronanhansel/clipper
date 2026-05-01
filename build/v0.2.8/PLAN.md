# v0.2.8 Plan

## Focus

v0.2.8 focuses on the Composition page, renamed to Compose, as the dedicated low-code surface for editing the composition currently under the timeline playhead.

## Goals

- Rename the Edit workflow to Compose across app state, UI, and persisted editor state.
- Make Compose show only the composition under the playhead, with no selected-or-first fallback.
- Keep animations enabled in Compose while preserving object selection and direct manipulation.
- Add a Compose-specific left Layers panel, with independent persisted resize state.
- Start a Penpot/Figma-style layer tree for normalized composition objects and background elements.
- Support quick entry into Compose by double-clicking a timeline composition clip.

## Progress

- Started the version with the Compose page rename and layers panel implementation.
