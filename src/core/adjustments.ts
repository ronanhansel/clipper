import type { AdjustmentLayer } from "./types";
import { getAdjustmentEffectPackage } from "./effects/registry";

export const defaultAdjustmentFrameRate = 30;

export function getActiveAdjustmentLayers(layers: AdjustmentLayer[] | undefined, sceneTime: number) {
  return (layers ?? []).filter((layer) => sceneTime >= layer.start && sceneTime < layer.start + layer.duration);
}

export function applyAdjustmentLayersToSceneTime(sceneTime: number, layers: AdjustmentLayer[] | undefined, frameRate = defaultAdjustmentFrameRate) {
  return getActiveAdjustmentLayers(layers, sceneTime).reduce((time, layer) => {
    return getAdjustmentEffectPackage(layer.effect.effectId)?.applySceneTime({ sceneTime: time, layer, frameRate }) ?? time;
  }, sceneTime);
}

export { quantizeFrameSkipTime } from "./effects/adjustments";
