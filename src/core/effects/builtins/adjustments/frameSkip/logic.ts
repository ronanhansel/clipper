import type { AdjustmentLayer } from "../../../../types";
import type { AdjustmentEffectPackage } from "../../../types";
export const frameSkipLogic = {
  applySceneTime: ({ sceneTime, layer, frameRate }) => quantizeFrameSkipTime(sceneTime, layer.start, getFrameSkipEvery(layer), frameRate),
  validate: (layer) => getFrameSkipEvery(layer) < 1 ? `Adjustment ${layer.name} must skip at least 1 frame.` : null,
} as const satisfies Partial<Pick<AdjustmentEffectPackage, "applySceneTime" | "validate">>;

export function getFrameSkipEvery(layer: Pick<AdjustmentLayer, "effect">) {
  return Math.max(1, Math.round(Number(layer.effect.params?.every) || 1));
}

export function quantizeFrameSkipTime(sceneTime: number, start: number, every: number, frameRate: number) {
  const frameStep = Math.max(1, Math.round(every));
  if (frameStep <= 1 || frameRate <= 0) return sceneTime;
  const elapsedFrames = Math.max(0, Math.floor((sceneTime - start) * frameRate));
  const heldFrame = Math.floor(elapsedFrames / frameStep) * frameStep;
  return start + heldFrame / frameRate;
}
