import type { TransitionLayer } from "../../types";

export const lightLeakBandsTransitionPostProcessKind =
  "clipper.postprocess.transition.lightLeakBands" as const;

export type LightLeakBandsTransitionPostProcessUniforms = {
  progress: number;
  intensity: number;
  softness: number;
  bandCount: number;
  drift: number;
  warmth: number;
  flicker: number;
  seed: number;
};

export type LightLeakBandsTransitionPostProcessPass = {
  id: string;
  sourceLayerId?: string;
  kind: typeof lightLeakBandsTransitionPostProcessKind;
  target: "final";
  requiresLiveDomSource: true;
  uniforms: LightLeakBandsTransitionPostProcessUniforms;
};

export function createLightLeakBandsTransitionPostProcessPass(input: {
  layer: TransitionLayer;
  progress: number;
}): LightLeakBandsTransitionPostProcessPass {
  return {
    id: `${input.layer.id}:light-leak-bands-transition-postprocess`,
    sourceLayerId: input.layer.id,
    kind: lightLeakBandsTransitionPostProcessKind,
    target: "final",
    requiresLiveDomSource: true,
    uniforms: getLightLeakBandsTransitionUniforms(input.layer, input.progress),
  };
}

export function getLightLeakBandsTransitionUniforms(
  layer: Pick<TransitionLayer, "effect">,
  progress: number,
): LightLeakBandsTransitionPostProcessUniforms {
  const seed = getNormalizedLightLeakSeed(layer);
  return {
    progress: clamp(progress, 0, 1),
    intensity: getClampedParam(layer, "intensity", 0.78, 0, 1),
    softness: getClampedParam(layer, "softness", 0.34, 0.02, 1),
    bandCount: Math.round(getClampedParam(layer, "bandCount", 4, 1, 12)),
    drift: getClampedParam(layer, "drift", 0.62, -2, 2),
    warmth: getClampedParam(layer, "warmth", 0.74, -1, 1),
    flicker: getClampedParam(layer, "flicker", 0.22, 0, 1),
    seed: clamp(seed, 0, 1000),
  };
}

export function getNormalizedLightLeakSeed(
  layer: Pick<TransitionLayer, "effect">,
) {
  const value = Number(layer.effect.params?.seed);
  if (!Number.isFinite(value)) return 53;
  if (value > 0 && value < 1) return Math.round(value * 100);
  return Math.round(value);
}

function getClampedParam(
  layer: Pick<TransitionLayer, "effect">,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = Number(layer.effect.params?.[key]);
  return clamp(Number.isFinite(value) ? value : fallback, min, max);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
