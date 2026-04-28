import type { AdjustmentLayer } from "./types";

export const defaultAdjustmentFrameRate = 30;

export function getActiveAdjustmentLayers(layers: AdjustmentLayer[] | undefined, sceneTime: number) {
  return (layers ?? []).filter((layer) => sceneTime >= layer.start && sceneTime < layer.start + layer.duration);
}

export function applyAdjustmentLayersToSceneTime(sceneTime: number, layers: AdjustmentLayer[] | undefined, frameRate = defaultAdjustmentFrameRate) {
  return getActiveAdjustmentLayers(layers, sceneTime).reduce((time, layer) => {
    if (layer.effect.kind !== "frameSkip") return time;
    return quantizeFrameSkipTime(time, layer.start, layer.effect.every, frameRate);
  }, sceneTime);
}

export function quantizeFrameSkipTime(sceneTime: number, start: number, every: number, frameRate = defaultAdjustmentFrameRate) {
  const frameStep = Math.max(1, Math.round(every));
  if (frameStep <= 1 || frameRate <= 0) return sceneTime;
  const elapsedFrames = Math.max(0, Math.floor((sceneTime - start) * frameRate));
  const heldFrame = Math.floor(elapsedFrames / frameStep) * frameStep;
  return start + heldFrame / frameRate;
}
