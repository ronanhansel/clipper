import { motionBlocksToMotionMarkers } from "../../core/motionEffects";
import type { TimelinePreviewStackPart } from "../../core/timeline";
import type {
  CompositionClip,
  Scene,
  TimelineLayerState,
  TimelineMode,
  TimelineMotionLayerState,
  TimelinePart,
  TransitionLayer,
} from "../../core/types";
import type { PostProcessPass } from "../../core/effects/types";
import {
  deriveFramePreviewSceneContext,
  deriveSceneRenderModel,
  getFramePreviewTimelineLayers,
  type FramePreviewSceneContext,
} from "./sceneRenderModel";

export {
  deriveFramePreviewSceneContext,
  getFramePreviewTimelineLayers,
} from "./sceneRenderModel";
export type { FramePreviewSceneContext } from "./sceneRenderModel";

export type FramePreviewRenderModel = {
  activeComposition: CompositionClip | null;
  activeTimelinePart: TimelinePart | null;
  adjustedSceneTime: number;
  hiddenMotionLayerIds: Set<string>;
  motionLayers: TimelineMotionLayerState[];
  part: CompositionClip;
  previewParts: TimelinePreviewStackPart[];
  previewTime: number;
  renderableScene: Scene;
  sceneDurationSeconds: number;
  timeline: TimelinePart[];
  timelineLayerState: TimelineLayerState;
  transitionLayers: TransitionLayer[];
  transitionPreviewParts: {
    from: TimelinePreviewStackPart[];
    to: TimelinePreviewStackPart[];
    fromSceneTime: number;
    toSceneTime: number;
    postProcessPasses: PostProcessPass[];
  } | null;
  visibleAdjustmentLayers: NonNullable<Scene["adjustmentLayers"]>;
};

export function deriveFramePreviewRenderModel({
  blankPart,
  frameRate,
  previewTransitionLayers,
  scene,
  sceneTime,
  timelineLayers,
  timelineMode,
}: {
  blankPart: CompositionClip;
  frameRate?: number;
  previewTransitionLayers?: Scene["transitionLayers"];
  scene: Scene;
  sceneTime: number;
  timelineLayers?: TimelineLayerState;
  timelineMode: TimelineMode;
}): FramePreviewRenderModel {
  const ctx = deriveFramePreviewSceneContext({
    blankPart,
    frameRate,
    previewTransitionLayers,
    scene,
    timelineLayers,
    timelineMode,
  });
  return deriveFramePreviewRenderModelFromContext(ctx, sceneTime, timelineMode);
}

export function deriveFramePreviewRenderModelFromContext(
  ctx: FramePreviewSceneContext,
  sceneTime: number,
  timelineMode: TimelineMode,
): FramePreviewRenderModel {
  const { blankPart, sceneMotionMarkers } = ctx;
  const sceneModel = deriveSceneRenderModel(ctx, sceneTime, timelineMode);
  const basePart = sceneModel.activeComposition ?? blankPart;
  const partStart = sceneModel.activeTimelinePart?.start ?? 0;
  const shiftedMotionMarkers = motionBlocksToMotionMarkers(
    sceneMotionMarkers.map((marker) => ({
      ...marker,
      start: marker.start - partStart,
    })),
  );
  return {
    activeComposition: sceneModel.activeComposition,
    activeTimelinePart: sceneModel.activeTimelinePart,
    adjustedSceneTime: sceneModel.adjustedSceneTime,
    hiddenMotionLayerIds: sceneModel.hiddenMotionLayerIds,
    motionLayers: sceneModel.motionLayers,
    part: { ...basePart, motionMarkers: shiftedMotionMarkers },
    previewParts: sceneModel.previewParts,
    previewTime: sceneModel.previewTime,
    renderableScene: sceneModel.renderableScene,
    sceneDurationSeconds: sceneModel.sceneDurationSeconds,
    timeline: sceneModel.timeline,
    timelineLayerState: sceneModel.timelineLayerState,
    transitionLayers: sceneModel.sceneTransitionLayers,
    transitionPreviewParts: sceneModel.transitionPreviewParts,
    visibleAdjustmentLayers: sceneModel.sceneAdjustments,
  };
}
