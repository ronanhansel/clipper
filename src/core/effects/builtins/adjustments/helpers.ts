import type {
  AdjustmentEffectId,
  AdjustmentEffectParams,
  AdjustmentLayer,
} from "../../../types";

export function createAdjustmentLayer(
  input: { id: string; layerId?: string; start: number; duration: number },
  name: string,
  effectId: AdjustmentEffectId,
  params: AdjustmentEffectParams,
): AdjustmentLayer {
  return {
    id: input.id,
    layerId: input.layerId,
    name,
    start: input.start,
    duration: input.duration,
    effect: { effectId, params },
  };
}

export function getNumericParam(
  layer: Pick<AdjustmentLayer, "effect">,
  key: string,
  fallback: number,
) {
  const value = Number(layer.effect.params?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function getClampedParam(
  layer: Pick<AdjustmentLayer, "effect">,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  return clamp(getNumericParam(layer, key, fallback), min, max);
}

export function getOverlayTarget(layer: Pick<AdjustmentLayer, "effect">) {
  return layer.effect.params?.target === "frame" ? "frame" : "camera";
}

export const overlayTargetControl = {
  key: "target",
  label: "Target",
  type: "select",
  defaultValue: "camera",
  options: [
    { value: "frame", label: "Frame" },
    { value: "camera", label: "Camera" },
  ],
} as const;

export function frameDuration(frameRate: number) {
  return frameRate > 0 ? 1 / frameRate : 0;
}

export function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
