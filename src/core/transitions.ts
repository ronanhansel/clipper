import { getTransitionEffectPackage } from "./effects/registry";
import type { TransitionSequenceStyle, TransitionVisualStyle } from "./effects/types";
import { easeProgress } from "../render-engine/renderRuntime";
import type { TransitionLayer } from "./types";

export const defaultTransitionFrameRate = 30;
export const minTransitionTimeSeconds = 0.1;
export const maxTransitionTimeSeconds = 10;

export function getActiveTransitionLayers(layers: TransitionLayer[] | undefined, sceneTime: number) {
  return (layers ?? []).filter((layer) => sceneTime >= layer.start && sceneTime < layer.start + getTransitionFinishTime(layer));
}

export function applyTransitionLayersToVisualStyle(sceneTime: number, layers: TransitionLayer[] | undefined, frameRate = defaultTransitionFrameRate): TransitionVisualStyle {
  return getActiveTransitionLayers(layers, sceneTime).reduce<TransitionVisualStyle>((style, layer) => {
    const progress = getTransitionProgress(sceneTime, layer);
    const nextStyle = getTransitionEffectPackage(layer.effect.effectId)?.applyVisualStyle?.({ sceneTime, layer, frameRate, progress });
    if (!nextStyle) return style;
    return {
      ...style,
      ...nextStyle,
      filter: [style.filter, nextStyle.filter].filter(Boolean).join(" ") || undefined,
      frameStyle: { ...style.frameStyle, ...nextStyle.frameStyle },
      cameraStyle: { ...style.cameraStyle, ...nextStyle.cameraStyle },
      overlays: [...(style.overlays ?? []), ...(nextStyle.overlays ?? [])],
    };
  }, {});
}

export function renderTransitionSequence(sceneTime: number, layer: TransitionLayer, frameRate = defaultTransitionFrameRate): TransitionSequenceStyle {
  const progress = getTransitionProgress(sceneTime, layer);
  return getTransitionEffectPackage(layer.effect.effectId)?.renderSequence?.({ sceneTime, layer, frameRate, progress }) ?? defaultTransitionSequenceStyle(progress);
}

export function getTransitionFinishTime(layer: TransitionLayer) {
  return Math.max(layer.duration, minTransitionTimeSeconds);
}

export function getTransitionMarkerTime(layer: Pick<TransitionLayer, "start" | "duration">) {
  return layer.start + layer.duration / 2;
}

export function normalizeSymmetricTransitionLayer<T extends TransitionLayer>(layer: T): T {
  return { ...layer, midPoint: layer.duration / 2 };
}

export function getTransitionProgress(sceneTime: number, layer: TransitionLayer) {
  const finishTime = getTransitionFinishTime(layer);
  const linearProgress = finishTime > 0 ? Math.min(Math.max((sceneTime - layer.start) / finishTime, 0), 1) : 1;
  return easeProgress(linearProgress, layer.effect.params?.ease ?? "easeInOut");
}

function defaultTransitionSequenceStyle(progress: number): TransitionSequenceStyle {
  const t = Math.min(Math.max(progress, 0), 1);
  return {
    aStyle: { transform: `translate3d(${-t * 100}%, 0, 0)` },
    bStyle: { transform: `translate3d(${(1 - t) * 100}%, 0, 0)` },
  };
}
