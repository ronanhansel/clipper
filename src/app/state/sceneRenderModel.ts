import { applyAdjustmentLayersToSceneTime } from "../../core/adjustments";
import type { CameraPreviewTransform } from "../../core/camera";
import { getMotionMarkerViews } from "../../core/motionEffects";
import {
  defaultTimelineLayerState,
  withRequiredTimelineLayerTypes,
} from "../../core/project";
import {
  buildLinearTimeline,
  getExecutableAdjustmentLayers,
  getExecutableTransitionLayers,
  getRenderableScene,
  getTimelinePreviewState,
  sceneDuration as getSceneDuration,
  type TimelinePreviewStackPart,
} from "../../core/timeline";
import type {
  CompositionClip,
  ProjectManifest,
  Scene,
  TimelineLayerState,
  TimelineMode,
  TimelineMotionLayerState,
  TimelinePart,
  TransitionLayer,
} from "../../core/types";
import type { PostProcessPass } from "../../core/effects/types";

export type SceneTransitionPreviewParts = {
  from: TimelinePreviewStackPart[];
  to: TimelinePreviewStackPart[];
  fromSceneTime: number;
  toSceneTime: number;
  postProcessPasses: PostProcessPass[];
};

export type SceneRenderModel = {
  activeComposition: CompositionClip | null;
  activeTimelinePart: TimelinePart | null;
  adjustedSceneTime: number;
  hiddenMotionLayerIds: Set<string>;
  motionLayers: TimelineMotionLayerState[];
  postProcessPasses: PostProcessPass[];
  previewParts: TimelinePreviewStackPart[];
  previewTime: number;
  renderableScene: Scene;
  sceneAdjustments: NonNullable<Scene["adjustmentLayers"]>;
  sceneCamera: CameraPreviewTransform | null;
  sceneDurationSeconds: number;
  sceneTransitionLayers: TransitionLayer[];
  timeline: TimelinePart[];
  timelineLayerState: TimelineLayerState;
  transitionPreviewParts: SceneTransitionPreviewParts | null;
};

export type FramePreviewSceneContext = {
  blankPart: CompositionClip;
  frameRate: number | undefined;
  hiddenMotionLayerIds: Set<string>;
  motionLayers: TimelineMotionLayerState[];
  renderableScene: Scene;
  sceneDurationSeconds: number;
  sceneMotionMarkers: ReturnType<typeof getMotionMarkerViews>["motionMarkers"];
  timeline: TimelinePart[];
  timelineLayerState: TimelineLayerState;
  transitionLayers: TransitionLayer[];
  visibleAdjustmentLayers: NonNullable<Scene["adjustmentLayers"]>;
};

export function deriveFramePreviewSceneContext({
  blankPart,
  frameRate,
  previewTransitionLayers,
  scene,
  timelineLayers,
  timelineMode,
}: {
  blankPart: CompositionClip;
  frameRate?: number;
  previewTransitionLayers?: Scene["transitionLayers"];
  scene: Scene;
  timelineLayers?: TimelineLayerState;
  timelineMode: TimelineMode;
}): FramePreviewSceneContext {
  const timelineLayerState = withRequiredTimelineLayerTypes(timelineLayers);
  const effectiveTransitionLayers =
    previewTransitionLayers ?? scene.transitionLayers;
  const sceneAdjustmentLayers = getExecutableAdjustmentLayers(
    scene.adjustmentLayers,
    timelineLayerState,
  );
  const visibleAdjustmentLayers =
    timelineMode === "compose" ? [] : sceneAdjustmentLayers;
  const renderableScene = getRenderableScene(
    { ...scene, transitionLayers: effectiveTransitionLayers },
    timelineLayerState,
  );
  const timeline = buildLinearTimeline(renderableScene);
  const sceneDurationSeconds = getSceneDuration(renderableScene);
  const sceneMotionMarkers =
    getMotionMarkerViews(renderableScene).motionMarkers;
  const motionLayers = timelineLayerState.motionLayers?.length
    ? timelineLayerState.motionLayers
    : defaultTimelineLayerState.motionLayers!;
  return {
    blankPart,
    frameRate,
    hiddenMotionLayerIds: new Set(
      motionLayers.filter((layer) => layer.hidden).map((layer) => layer.id),
    ),
    motionLayers,
    renderableScene,
    sceneDurationSeconds,
    sceneMotionMarkers,
    timeline,
    timelineLayerState,
    transitionLayers: getExecutableTransitionLayers(
      effectiveTransitionLayers,
      timelineLayerState,
    ),
    visibleAdjustmentLayers,
  };
}

export function deriveSceneRenderModel(
  ctx: FramePreviewSceneContext,
  sceneTime: number,
  timelineMode: TimelineMode,
): SceneRenderModel {
  const {
    frameRate,
    hiddenMotionLayerIds,
    motionLayers,
    renderableScene,
    sceneDurationSeconds,
    timeline,
    timelineLayerState,
    transitionLayers,
    visibleAdjustmentLayers,
  } = ctx;
  const adjustedSceneTime =
    timelineMode === "compose"
      ? sceneTime
      : applyAdjustmentLayersToSceneTime(
          sceneTime,
          visibleAdjustmentLayers,
          frameRate,
        );
  const previewState = getTimelinePreviewState({
    adjustmentLayers: [],
    compositions: renderableScene.compositions,
    sceneDurationSeconds,
    sceneTime: adjustedSceneTime,
    timeline,
    timelineLayers: timelineLayerState,
    timelineMode,
    transitionLayers: renderableScene.transitionLayers,
  });
  const transitionPreviewParts = previewState.transitionPreviewParts
    ? {
        from: previewState.transitionPreviewParts.from,
        to: previewState.transitionPreviewParts.to,
        fromSceneTime: previewState.transitionPreviewParts.fromSceneTime,
        toSceneTime: previewState.transitionPreviewParts.toSceneTime,
        postProcessPasses:
          previewState.transitionPreviewParts.postProcessPasses,
      }
    : null;
  const postProcessPasses = transitionPreviewParts?.postProcessPasses ?? [];
  return {
    activeComposition: previewState.activeComposition,
    activeTimelinePart: previewState.activeTimelinePart,
    adjustedSceneTime,
    hiddenMotionLayerIds,
    motionLayers,
    postProcessPasses,
    previewParts: previewState.previewParts,
    previewTime: previewState.previewTime,
    renderableScene,
    sceneAdjustments: visibleAdjustmentLayers,
    sceneCamera: null,
    sceneDurationSeconds,
    sceneTransitionLayers: transitionLayers,
    timeline,
    timelineLayerState,
    transitionPreviewParts,
  };
}

export function getFramePreviewTimelineLayers(
  project: ProjectManifest,
  sceneId: string,
): TimelineLayerState | undefined {
  return (
    (project.timelines ?? []).find((timeline) => timeline.id === sceneId)
      ?.timelineLayers ?? project.editorState?.timelineLayers
  );
}
