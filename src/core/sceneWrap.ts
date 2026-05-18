import type { TimelineMode } from "./types";

/**
 * Single switch that controls which scene-level wrappers apply on top of the
 * composition. Compose mode disables every wrapper (the composition is the
 * unit being edited); Direct mode enables them all (the composition is being
 * placed in a scene).
 *
 * `flattenComposition` decouples "treat composition as a flat sealed frame"
 * from `cameraEnabled` ("apply scene camera transform"). Direct sets both
 * true today, but a future Direct mode could keep flatten on while disabling
 * the scene camera. Consumers MUST use the field that matches their intent:
 *   - `cameraEnabled`        → "should I apply the scene camera transform?"
 *   - `flattenComposition`   → "is the composition a sealed/flat output?"
 *
 * This is the canonical mode boundary. Every consumer that branches on
 * "compose vs direct" SHOULD read from this config rather than recomputing
 * `timelineMode === "compose"`. The render model, master clock, and timeline
 * preview lookup all consult the same function so they cannot drift.
 */
export type SceneWrapConfig = {
  cameraEnabled: boolean;
  adjustmentsEnabled: boolean;
  transitionsEnabled: boolean;
  motionEnabled: boolean;
  hideNullObjects: boolean;
  flattenComposition: boolean;
  /**
   * Compose-style modes lock all authoring interactions during playback so
   * the user sees a clean preview. Direct-style modes leave authoring
   * affordances live during playback. Mirrors `flattenComposition` in
   * intent — both are "compose treats this as a sealed unit" rules.
   */
  interactionsLockedDuringPlayback: boolean;
};

export function sceneWrapConfigForMode(mode: TimelineMode): SceneWrapConfig {
  const direct = mode === "direct";
  return {
    cameraEnabled: direct,
    adjustmentsEnabled: direct,
    transitionsEnabled: direct,
    motionEnabled: direct,
    hideNullObjects: direct,
    flattenComposition: direct,
    interactionsLockedDuringPlayback: !direct,
  };
}
