import { useMemo } from "react";
import {
  buildAdjustmentExecutionPlan,
  filterAdjustmentExecutionPlan,
  getVisualStyleForAdjustmentPlan,
} from "../../../core/adjustments";
import { getCameraPostProcessPasses } from "../../../core/cameraEffectsPasses";
import { selectLiveDomPostProcessPasses } from "../../../core/effects/postprocess/passes";
import type {
  AdjustmentExecutionPlan,
  AdjustmentVisualStyle,
  PostProcessPass,
} from "../../../core/effects/types";
import {
  getActiveTransitionLayers,
  getTransitionPostProcessPasses,
} from "../../../core/transitions";
import type {
  AdjustmentLayer,
  CameraObjectProps,
  CompositionClip,
  TransitionLayer,
} from "../../../core/types";

export interface PostProcessPlanFrameSize {
  width: number;
  height: number;
}

export interface PostProcessPlanTransitionInput {
  transitionLayers?: TransitionLayer[];
}

export interface CameraPostProcessSceneInput {
  part: CompositionClip;
  localTime: number;
}

export interface PostProcessPlan {
  plan: AdjustmentExecutionPlan;
  passes: PostProcessPass[];
  livePasses: PostProcessPass[];
  hasLivePasses: boolean;
  planAfterLastLive: AdjustmentExecutionPlan;
  planBeforeFirstLive: AdjustmentExecutionPlan;
  visualStyleAfterLastLive: AdjustmentVisualStyle;
  visualStyleBeforeFirstLive: AdjustmentVisualStyle;
  visualStyle: AdjustmentVisualStyle;
}

const emptyPlan: AdjustmentExecutionPlan = { activeLayers: [], steps: [] };
const emptyVisualStyle: AdjustmentVisualStyle = { overlays: [] };

function deriveTransitionPasses(
  sceneTime: number,
  transitionInput: PostProcessPlanTransitionInput | null | undefined,
  frameSize: PostProcessPlanFrameSize,
): PostProcessPass[] {
  if (!transitionInput?.transitionLayers?.length) return [];
  const activeLayers = getActiveTransitionLayers(
    transitionInput.transitionLayers,
    sceneTime,
  );
  const passes: PostProcessPass[] = [];
  for (const layer of activeLayers) {
    passes.push(
      ...getTransitionPostProcessPasses(sceneTime, layer, undefined, {
        width: frameSize.width,
        height: frameSize.height,
      }),
    );
  }
  return passes;
}

export function computePostProcessPlan(
  sceneTime: number,
  adjustmentLayers: AdjustmentLayer[] | undefined,
  transitionInput: PostProcessPlanTransitionInput | null | undefined,
  frameSize: PostProcessPlanFrameSize,
  cameraProps: CameraObjectProps | null = null,
  dofScene?: CameraPostProcessSceneInput,
): PostProcessPlan {
  const plan = buildAdjustmentExecutionPlan(
    sceneTime,
    adjustmentLayers,
    undefined,
    frameSize,
  );
  const cameraPasses = cameraProps
    ? getCameraPostProcessPasses(cameraProps, {
        idScope: "camera",
        frameSize,
        dofScene,
      })
    : [];
  const passes: PostProcessPass[] = [
    ...cameraPasses,
    ...plan.steps.flatMap((step) => step.postProcessPasses ?? []),
    ...deriveTransitionPasses(sceneTime, transitionInput, frameSize),
  ];
  const livePasses = selectLiveDomPostProcessPasses(passes);
  const lastLive = livePasses.at(-1);
  const firstLive = livePasses[0];
  const visualStyle = getVisualStyleForAdjustmentPlan(plan);
  const planAfterLastLive = lastLive
    ? filterAdjustmentExecutionPlan(plan, "after", lastLive.sourceLayerId)
    : plan;
  const planBeforeFirstLive = firstLive
    ? filterAdjustmentExecutionPlan(plan, "before", firstLive.sourceLayerId)
    : emptyPlan;
  const visualStyleAfterLastLive = lastLive
    ? getVisualStyleForAdjustmentPlan(planAfterLastLive)
    : visualStyle;
  const visualStyleBeforeFirstLive = firstLive
    ? getVisualStyleForAdjustmentPlan(planBeforeFirstLive)
    : emptyVisualStyle;
  return {
    plan,
    passes,
    livePasses,
    hasLivePasses: livePasses.length > 0,
    planAfterLastLive,
    planBeforeFirstLive,
    visualStyleAfterLastLive,
    visualStyleBeforeFirstLive,
    visualStyle,
  };
}

export function usePostProcessPlan(
  sceneTime: number,
  adjustmentLayers: AdjustmentLayer[] | undefined,
  transitionInput: PostProcessPlanTransitionInput | null | undefined,
  frameSize: PostProcessPlanFrameSize,
  cameraProps: CameraObjectProps | null = null,
  dofScene?: CameraPostProcessSceneInput,
): PostProcessPlan {
  return useMemo(
    () =>
      computePostProcessPlan(
        sceneTime,
        adjustmentLayers,
        transitionInput,
        frameSize,
        cameraProps,
        dofScene,
      ),
    [
      sceneTime,
      adjustmentLayers,
      transitionInput,
      frameSize.width,
      frameSize.height,
      cameraProps,
      dofScene,
    ],
  );
}
