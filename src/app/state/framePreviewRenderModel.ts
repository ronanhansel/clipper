import { applyAdjustmentLayersToSceneTime } from "../../core/adjustments";
import {
  getMotionMarkerViews,
  motionBlocksToMotionMarkers,
} from "../../core/motionEffects";
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

// Time-independent portion of the render model — expensive to compute,
// only changes when scene/layers/mode change (not on every scrub tick).
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
  const {
    blankPart,
    frameRate,
    hiddenMotionLayerIds,
    motionLayers,
    renderableScene,
    sceneDurationSeconds,
    sceneMotionMarkers,
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
  const activeTimelinePart = previewState.activeTimelinePart;
  const basePart = previewState.activeComposition ?? blankPart;
  const partStart = activeTimelinePart?.start ?? 0;
  const shiftedMotionMarkers = getShiftedSceneMotionMarkers(
    sceneMotionMarkers,
    partStart,
  );
  const previewParts = withSceneMotionPreviewParts(
    previewState.previewParts,
    sceneMotionMarkers,
  );
  const transitionPreviewParts = previewState.transitionPreviewParts
    ? {
        ...previewState.transitionPreviewParts,
        from: withSceneMotionPreviewParts(
          previewState.transitionPreviewParts.from,
          sceneMotionMarkers,
        ),
        to: withSceneMotionPreviewParts(
          previewState.transitionPreviewParts.to,
          sceneMotionMarkers,
        ),
        postProcessPasses:
          previewState.transitionPreviewParts.postProcessPasses,
      }
    : null;

  return {
    activeComposition: previewState.activeComposition,
    activeTimelinePart,
    adjustedSceneTime,
    hiddenMotionLayerIds,
    motionLayers,
    part: { ...basePart, motionMarkers: shiftedMotionMarkers },
    previewParts,
    previewTime: previewState.previewTime,
    renderableScene,
    sceneDurationSeconds,
    timeline,
    timelineLayerState,
    transitionLayers,
    transitionPreviewParts,
    visibleAdjustmentLayers,
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

function withSceneMotionPreviewParts(
  parts: TimelinePreviewStackPart[],
  sceneMotionMarkers: ReturnType<typeof getMotionMarkerViews>["motionMarkers"],
): TimelinePreviewStackPart[] {
  return parts.map((item) => ({
    ...item,
    part: {
      ...item.part,
      motionMarkers: getShiftedSceneMotionMarkers(
        sceneMotionMarkers,
        item.start,
      ),
    },
  }));
}

function getShiftedSceneMotionMarkers(
  sceneMotionMarkers: ReturnType<typeof getMotionMarkerViews>["motionMarkers"],
  partStart: number,
) {
  return motionBlocksToMotionMarkers(
    sceneMotionMarkers.map((marker) => ({
      ...marker,
      start: marker.start - partStart,
    })),
  );
}
