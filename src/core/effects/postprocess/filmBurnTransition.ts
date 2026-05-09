import type { TransitionLayer } from "../../types";

export const filmBurnTransitionPostProcessKind =
  "clipper.postprocess.transition.filmBurn" as const;

export type FilmBurnTransitionPostProcessUniforms = {
  progress: number;
  intensity: number;
  softness: number;
  grain: number;
  seed: number;
};

export type FilmBurnTransitionPostProcessPass = {
  id: string;
  sourceLayerId?: string;
  kind: typeof filmBurnTransitionPostProcessKind;
  target: "final";
  requiresLiveDomSource: true;
  uniforms: FilmBurnTransitionPostProcessUniforms;
};

export function createFilmBurnTransitionPostProcessPass(input: {
  layer: TransitionLayer;
  progress: number;
}): FilmBurnTransitionPostProcessPass {
  return {
    id: `${input.layer.id}:film-burn-transition-postprocess`,
    sourceLayerId: input.layer.id,
    kind: filmBurnTransitionPostProcessKind,
    target: "final",
    requiresLiveDomSource: true,
    uniforms: getFilmBurnTransitionUniforms(input.layer, input.progress),
  };
}

export function getFilmBurnTransitionUniforms(
  layer: Pick<TransitionLayer, "effect">,
  progress: number,
): FilmBurnTransitionPostProcessUniforms {
  return {
    progress: clamp(progress, 0, 1),
    intensity: getClampedParam(layer, "intensity", 0.92, 0, 1),
    softness: getClampedParam(layer, "softness", 0.42, 0.02, 1),
    grain: getClampedParam(layer, "grain", 0.26, 0, 1),
    seed: getClampedParam(layer, "seed", 0.37, 0, 1000),
  };
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
