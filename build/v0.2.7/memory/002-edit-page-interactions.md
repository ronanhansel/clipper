## Edit Page Interaction Diagnostics

Investigating a report that the edit page cannot move elements or edit text. Focus areas are frame pointer hit-testing, selection state, text editing state, and any overlay or CSS that can block pointer events.

Findings: frame object move/text editing is intentionally gated by three states: top toolbar `Interactive`, bottom timeline `Edit`, and playback paused. `useEditorDerivedState` exposes `canSelectFrameObjects` only when `timelineMode === "edit"`; `FramePreview` additionally disables frame/object pointer handlers while `isPlaying` is true. TypeScript typecheck passes with the current interaction wiring.

Root cause for snap-back after dropping/moving or committing text: frame edits were written to `scene.compositions`, but `normalizeProject()` rebuilds scenes from canonical `compositions` and timeline clips. The fix routes object/text/frame/background edits through `updateCompositionForTimelinePart`, resolving the active timeline clip to `compositionId ?? partId` and updating the canonical composition document via `replacePartInProject`. Drag and resize commits now use the same path, so source sync sees the changed composition and regeneration no longer discards edits.
