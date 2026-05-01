# Built-In Effect Regrouping

## Goal
- Simplify built-in Effects panel folders.
- Adjustment effects should appear under `Timing`, `Visual`, and `Overlay`.
- Motion effects should appear under `Scale` and `Disposition`.

## Architecture Notes
- Grouping remains manifest-owned through each effect package `group` field.
- Colour Grade and other colour-only adjustment manifests now use `Visual`.
- Film and lens overlay adjustment manifests now use the flat `Overlay` group instead of nested overlay subgroups.
- Pan, Rotate, and Perspective motion manifests now use `Disposition`; Zoom remains in `Scale`.

## Follow-Up
- Effects panel folder open/closed state is persisted in `EditorState.effectsPanelState.openGroups`.
- The left panel keeps both Assets and Effects mounted while switching tabs so each panel preserves scroll position and local UI state.
