# Composition Drop Preview Node

- Started from the file-manager composition pointer-drag path in `src/components/FileManager.tsx`, which emits `compositionPointerDragEvent` with composition id, duration, and label.
- The timeline receives that event in `src/components/timeline/TimelinePanel.tsx` and previously rendered composition drop previews through the generic `EffectDragPreviewBlock`, which did not match placed composition nodes.
- Goal: reuse the same composition timeline node render for both placed clips and the drop preview, with placement still driven by `effectDragPreviewRef` and rAF transform updates.
- Implemented `CompositionTimelineBlock` in `TimelinePanel.tsx` and use it for both existing timeline composition clips and `EffectDragPreviewBlock` when the preview category is `composition`.
- Extended the composition pointer-drag payload with `isEmpty` and `sourceMissing` from `FileManager.tsx` so the preview picks the same empty/unlinked/full visual variant as the actual timeline node.
- Verified with `npm run typecheck`.
