import type { AdjustmentLayer } from "../../../../types";
import type { AdjustmentEffectPackage } from "../../../types";
import { clamp, frameDuration, getNumericParam } from "../helpers";

export const speedChangeLogic = {
  timeSensitive: true,
  applySceneTime: ({ sceneTime, layer, frameRate }) => {
    const maxTime =
      layer.start + Math.max(0, layer.duration - frameDuration(frameRate));
    const mapped =
      layer.start + Math.max(0, sceneTime - layer.start) * getSpeed(layer);
    return clamp(mapped, layer.start, maxTime);
  },
  getDisplayElapsed: ({ elapsed, layer }) =>
    clamp(elapsed, 0, layer.duration) / getSpeed(layer),
  validate: (layer) =>
    getNumericParam(layer, "speed", 0.5) <= 0
      ? `Adjustment ${layer.name} must use a speed greater than 0.`
      : null,
} as const satisfies Partial<
  Pick<
    AdjustmentEffectPackage,
    "applySceneTime" | "getDisplayElapsed" | "timeSensitive" | "validate"
  >
>;

export function getSpeed(layer: Pick<AdjustmentLayer, "effect">) {
  return Math.max(0.05, Number(layer.effect.params?.speed) || 0.5);
}
