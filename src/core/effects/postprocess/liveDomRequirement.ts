import {
  applyAdjustmentLayersToPostProcessPasses,
  defaultAdjustmentFrameRate,
} from "../../adjustments";
import type { AdjustmentLayer, TransitionLayer } from "../../types";
import {
  getAdjustmentEffectPackage,
  getTransitionEffectPackage,
} from "../registry";
import type { PostProcessPass } from "../types";

export function adjustmentLayersRequireLiveDomPostProcessSource(
  layers: AdjustmentLayer[] | undefined,
) {
  return (layers ?? []).some((layer) =>
    Boolean(
      getAdjustmentEffectPackage(layer.effect.effectId)
        ?.requiresLiveDomPostProcessSource,
    ),
  );
}

export function transitionLayersRequireLiveDomPostProcessSource(
  layers: TransitionLayer[] | undefined,
) {
  return (layers ?? []).some((layer) =>
    Boolean(
      getTransitionEffectPackage(layer.effect.effectId)
        ?.requiresLiveDomPostProcessSource,
    ),
  );
}

export function collectLiveDomPostProcessRequirement(input: {
  sceneTime: number;
  layers: AdjustmentLayer[] | undefined;
  frameRate?: number;
  frameSize: { width: number; height: number };
}) {
  const passes = applyAdjustmentLayersToPostProcessPasses(
    input.sceneTime,
    input.layers,
    input.frameRate ?? defaultAdjustmentFrameRate,
    input.frameSize,
  );
  return {
    passes,
    requiresLiveDomSource: postProcessPassesRequireLiveDomSource(passes),
  };
}

export function postProcessPassesRequireLiveDomSource(
  passes: PostProcessPass[],
) {
  return passes.some((pass) => pass.requiresLiveDomSource);
}
