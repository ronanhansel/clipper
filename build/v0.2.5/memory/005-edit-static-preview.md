## Edit Static Preview

Updated for v0.2.5 to disable preview animations while the timeline is in `edit` mode, so users can see the full static layout and select elements without waiting for intro/keyframe timing.

Architecture note: render-time motion gating lives in `src/core/renderRuntime.ts` via `RenderEvaluationOptions`, because both regular objects and background layers share that evaluation path. `src/components/preview/FramePreview.tsx` derives `animationsEnabled` from `timelineMode !== "edit"` and passes it through object, background, and generated chart views. Legacy hard-coded preview animations remain local to `FramePreview` but now use the same gate.

Reuse: future preview-only animations should route through `evaluateObjectForPreview` or accept the same `animationsEnabled` flag so edit mode stays static while composition/playback keeps motion behavior.
