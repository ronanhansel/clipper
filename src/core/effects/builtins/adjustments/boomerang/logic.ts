import type { AdjustmentEffectPackage } from "../../../types";
import { clamp, frameDuration } from "../helpers";

export const boomerangLogic = {
  applySceneTime: ({ sceneTime, layer, frameRate }) => {
    const elapsed = Math.max(0, sceneTime - layer.start);
    const halfDuration = Math.max(layer.duration / 2, frameDuration(frameRate));
    const maxTime = layer.start + Math.max(0, layer.duration - frameDuration(frameRate));
    const mapped = elapsed <= halfDuration
      ? layer.start + elapsed * 2
      : maxTime - (elapsed - halfDuration) * 2;
    return clamp(mapped, layer.start, maxTime);
  },
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applySceneTime">>;
