import type { AdjustmentEffectPackage } from "../../../types";
import { clamp, frameDuration } from "../helpers";

export const reverseLogic = {
  applySceneTime: ({ sceneTime, layer, frameRate }) => {
    const elapsed = Math.max(0, sceneTime - layer.start);
    return clamp(
      layer.start + layer.duration - frameDuration(frameRate) - elapsed,
      layer.start,
      layer.start + layer.duration,
    );
  },
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applySceneTime">>;
