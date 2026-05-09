import type { AdjustmentLayer } from "../../types";
import { clamp } from "../builtins/adjustments/helpers";

export const vhsTrackingPostProcessKind =
  "clipper.postprocess.vhsTracking" as const;

export type VhsTrackingPostProcessUniforms = {
  time: number;
  intensity: number;
  speed: number;
  horizontalTear: number;
  verticalRoll: number;
  jitter: number;
  bandSize: number;
  chromaShiftPixels: number;
  scanlines: number;
  noise: number;
  dropout: number;
  tapeStretch: number;
  seed: number;
};

export type VhsTrackingPostProcessPass = {
  id: string;
  sourceLayerId?: string;
  kind: typeof vhsTrackingPostProcessKind;
  target: "final";
  requiresLiveDomSource: true;
  uniforms: VhsTrackingPostProcessUniforms;
};

export function createVhsTrackingPostProcessPass(input: {
  layer: AdjustmentLayer;
  sceneTime: number;
}): VhsTrackingPostProcessPass {
  const { layer, sceneTime } = input;
  return {
    id: `${layer.id}:vhs-tracking-postprocess`,
    sourceLayerId: layer.id,
    kind: vhsTrackingPostProcessKind,
    target: "final",
    requiresLiveDomSource: true,
    uniforms: getVhsTrackingPostProcessUniforms(layer, sceneTime),
  };
}

export function getVhsTrackingPostProcessUniforms(
  layer: Pick<AdjustmentLayer, "effect">,
  sceneTime: number,
): VhsTrackingPostProcessUniforms {
  return {
    time: sceneTime,
    intensity: getClampedParam(layer, "intensity", 0.72, 0, 1.5),
    speed: getClampedParam(layer, "speed", 1, 0, 5),
    horizontalTear: getClampedParam(layer, "horizontalTear", 0.72, 0, 1.5),
    verticalRoll: getClampedParam(layer, "verticalRoll", 0.22, -1, 1),
    jitter: getClampedParam(layer, "jitter", 0.42, 0, 1.5),
    bandSize: getClampedParam(layer, "bandSize", 0.18, 0.02, 0.65),
    chromaShiftPixels: getClampedParam(layer, "chromaShift", 2.4, -24, 24),
    scanlines: getClampedParam(layer, "scanlines", 0.28, 0, 1),
    noise: getClampedParam(layer, "noise", 0.16, 0, 1),
    dropout: getClampedParam(layer, "dropout", 0.16, 0, 1),
    tapeStretch: getClampedParam(layer, "tapeStretch", 0.2, 0, 1),
    seed: getNumericParam(layer, "seed", 23),
  };
}

function getNumericParam(
  layer: Pick<AdjustmentLayer, "effect">,
  key: string,
  fallback: number,
) {
  const value = Number(layer.effect.params?.[key]);
  return Number.isFinite(value) ? value : fallback;
}

function getClampedParam(
  layer: Pick<AdjustmentLayer, "effect">,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  return clamp(getNumericParam(layer, key, fallback), min, max);
}
