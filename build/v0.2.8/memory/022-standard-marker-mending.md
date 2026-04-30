## Standard Marker Mending

Work started to standardize timeline marker behavior so mending is a shared marker capability rather than motion-specific behavior.

User intent:
- All timeline markers should behave consistently.
- The only allowed behavioral difference should be explicit mending support, controlled by effect manifest metadata.
- Mending is grouping adjacent markers in the same layer; it should apply to two or more neighboring markers.
- Snapping is separate optional marker metadata and should not be hard-coded to motion semantics.
- Composition and adjustment snapping remain unsupported for now; inspector UI should allow mending only where applicable and disable unsupported snapping controls.

Final notes:
- Mending is now driven by explicit `mendInId` / `mendOutId` references and no longer requires `snapIn` / `snapOut` flags.
- Active mended pairs must be adjacent and in the same resolved marker layer. Legacy explicit references are still expanded for overwrite protection so old non-adjacent references do not get overwritten accidentally.
- Shared core helpers in `src/core/timeline.ts` resolve marker layers and effect manifest tags for motion markers and adjustment-layer-shaped objects (`layer.effect.effectId`). Effects are mendable by default unless their manifest includes `blocksMending`.
- The current timeline UI still implements motion marker mending only. Composition and adjustment snapping remain unsupported in the inspector, and the inspector exposes only the motion middle-mend action for now.
- Motion lane mended-edge rendering now reads shared core mending logic instead of duplicating kind-specific edge detection.
