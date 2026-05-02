import { getTransitionEffectPackage } from "./effects/registry";
import type { TransitionVisualStyle } from "./effects/types";
import type { TransitionLayer } from "./types";

export const defaultTransitionFrameRate = 30;

export function getActiveTransitionLayers(layers: TransitionLayer[] | undefined, sceneTime: number) {
  return (layers ?? []).filter((layer) => sceneTime >= layer.start && sceneTime < layer.start + layer.duration);
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

function getTransitionProgress(sceneTime: number, layer: TransitionLayer) {
  if (layer.duration <= 0) return 1;
  return Math.min(Math.max((sceneTime - layer.start) / layer.duration, 0), 1);
}
