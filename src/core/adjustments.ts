import type { AdjustmentLayer } from "./types";
import { getAdjustmentEffectPackage } from "./effects/registry";
import type { AdjustmentVisualStyle } from "./effects/types";

export const defaultAdjustmentFrameRate = 30;

export function getActiveAdjustmentLayers(layers: AdjustmentLayer[] | undefined, sceneTime: number) {
  return (layers ?? []).filter((layer) => sceneTime >= layer.start && sceneTime < layer.start + layer.duration);
}

export function applyAdjustmentLayersToSceneTime(sceneTime: number, layers: AdjustmentLayer[] | undefined, frameRate = defaultAdjustmentFrameRate, options?: { includeTimeSensitive?: boolean }) {
  const includeTimeSensitive = options?.includeTimeSensitive ?? true;
  return getActiveAdjustmentLayers(layers, sceneTime).reduce((time, layer) => {
    const effect = getAdjustmentEffectPackage(layer.effect.effectId);
    if (!includeTimeSensitive && effect?.timeSensitive) return time;
    return effect?.applySceneTime?.({ sceneTime: time, layer, frameRate }) ?? time;
  }, sceneTime);
}

export function applyPlaybackAdjustmentLayersToSceneTime(sceneTime: number, layers: AdjustmentLayer[] | undefined, frameRate = defaultAdjustmentFrameRate) {
  return applyAdjustmentLayersToSceneTime(sceneTime, layers, frameRate, { includeTimeSensitive: false });
}

export function applyAdjustmentLayersToVisualStyle(sceneTime: number, layers: AdjustmentLayer[] | undefined, frameRate = defaultAdjustmentFrameRate): AdjustmentVisualStyle {
  return getActiveAdjustmentLayers(layers, sceneTime).reduce<AdjustmentVisualStyle>((style, layer) => {
    const nextStyle = getAdjustmentEffectPackage(layer.effect.effectId)?.applyVisualStyle?.({ sceneTime, layer, frameRate });
    if (!nextStyle) return style;
    return {
      ...style,
      ...nextStyle,
      filter: [style.filter, nextStyle.filter].filter(Boolean).join(" ") || undefined,
      overlays: [...(style.overlays ?? []), ...(nextStyle.overlays ?? [])],
    };
  }, {});
}

export function getTimeSensitiveDisplayTime(sceneTime: number, layers: AdjustmentLayer[] | undefined, frameRate = defaultAdjustmentFrameRate) {
  return getTimeSensitiveLayers(layers).reduce((time, layer) => {
    if (sceneTime <= layer.start) return time;
    const elapsed = Math.min(sceneTime, layer.start + layer.duration) - layer.start;
    const displayElapsed = getAdjustmentEffectPackage(layer.effect.effectId)?.getDisplayElapsed?.({ elapsed, layer, frameRate }) ?? elapsed;
    return time + displayElapsed - elapsed;
  }, sceneTime);
}

export function getTimeSensitiveDisplayDuration(sceneDuration: number, layers: AdjustmentLayer[] | undefined, frameRate = defaultAdjustmentFrameRate) {
  return getTimeSensitiveLayers(layers).reduce((duration, layer) => {
    const boundedDuration = Math.max(0, Math.min(layer.duration, sceneDuration - layer.start));
    if (boundedDuration <= 0) return duration;
    const displayElapsed = getAdjustmentEffectPackage(layer.effect.effectId)?.getDisplayElapsed?.({ elapsed: boundedDuration, layer: { ...layer, duration: boundedDuration }, frameRate }) ?? boundedDuration;
    return duration + displayElapsed - boundedDuration;
  }, sceneDuration);
}

export function getSceneTimeForTimeSensitiveDisplayTime(displayTime: number, sceneDuration: number, layers: AdjustmentLayer[] | undefined, frameRate = defaultAdjustmentFrameRate) {
  let displayOffset = 0;
  for (const layer of getTimeSensitiveLayers(layers)) {
    const boundedDuration = Math.max(0, Math.min(layer.duration, sceneDuration - layer.start));
    if (boundedDuration <= 0) continue;

    const displayStart = layer.start + displayOffset;
    const displayElapsed = getAdjustmentEffectPackage(layer.effect.effectId)?.getDisplayElapsed?.({ elapsed: boundedDuration, layer: { ...layer, duration: boundedDuration }, frameRate }) ?? boundedDuration;
    const displayEnd = displayStart + displayElapsed;
    if (displayTime < displayStart) return clampSceneTime(displayTime - displayOffset, sceneDuration);
    if (displayTime <= displayEnd) {
      const progress = displayElapsed > 0 ? (displayTime - displayStart) / displayElapsed : 1;
      return clampSceneTime(layer.start + boundedDuration * progress, sceneDuration);
    }
    displayOffset += displayElapsed - boundedDuration;
  }

  return clampSceneTime(displayTime - displayOffset, sceneDuration);
}

export function advanceTimeSensitiveSceneTime(startSceneTime: number, elapsedSeconds: number, sceneDuration: number, layers: AdjustmentLayer[] | undefined, frameRate = defaultAdjustmentFrameRate) {
  const startDisplayTime = getTimeSensitiveDisplayTime(startSceneTime, layers, frameRate);
  return getSceneTimeForTimeSensitiveDisplayTime(startDisplayTime + Math.max(0, elapsedSeconds), sceneDuration, layers, frameRate);
}

function getTimeSensitiveLayers(layers: AdjustmentLayer[] | undefined) {
  return (layers ?? [])
    .filter((layer) => getAdjustmentEffectPackage(layer.effect.effectId)?.timeSensitive)
    .sort((left, right) => left.start - right.start);
}

function clampSceneTime(time: number, sceneDuration: number) {
  return Math.min(Math.max(time, 0), sceneDuration);
}

export { quantizeFrameSkipTime } from "./effects/adjustments";
