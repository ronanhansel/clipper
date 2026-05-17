import { useMemo } from "react";
import {
  buildAdjustmentExecutionPlan,
  filterAdjustmentExecutionPlan,
  getVisualStyleForAdjustmentPlan,
} from "../../../core/adjustments";
import { selectLiveDomPostProcessPasses } from "../../../core/effects/postprocess/passes";
import type {
  AdjustmentExecutionPlan,
  AdjustmentVisualStyle,
  PostProcessPass,
} from "../../../core/effects/types";
import type { AdjustmentLayer } from "../../../core/types";

export interface PostProcessPlanFrameSize {
  width: number;
  height: number;
}

export interface PostProcessPlanTransitionInput {
  postProcessPasses?: PostProcessPass[];
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

export function computePostProcessPlan(
  sceneTime: number,
  adjustmentLayers: AdjustmentLayer[] | undefined,
  transitionPreviewParts: PostProcessPlanTransitionInput | null | undefined,
  frameSize: PostProcessPlanFrameSize,
): PostProcessPlan {
  const plan = buildAdjustmentExecutionPlan(
    sceneTime,
    adjustmentLayers,
    undefined,
    frameSize,
  );
  const passes: PostProcessPass[] = [
    ...plan.steps.flatMap((step) => step.postProcessPasses ?? []),
    ...(transitionPreviewParts?.postProcessPasses ?? []),
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
  transitionPreviewParts: PostProcessPlanTransitionInput | null | undefined,
  frameSize: PostProcessPlanFrameSize,
): PostProcessPlan {
  return useMemo(
    () =>
      computePostProcessPlan(
        sceneTime,
        adjustmentLayers,
        transitionPreviewParts,
        frameSize,
      ),
    [
      sceneTime,
      adjustmentLayers,
      transitionPreviewParts,
      frameSize.width,
      frameSize.height,
    ],
  );
}
