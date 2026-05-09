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
  } | null;
  visibleAdjustmentLayers: NonNullable<Scene["adjustmentLayers"]>;
};

export function deriveFramePreviewRenderModel({
  blankPart,
  frameRate,
  scene,
  sceneTime,
  timelineLayers,
  timelineMode,
}: {
  blankPart: CompositionClip;
  frameRate?: number;
  scene: Scene;
  sceneTime: number;
  timelineLayers?: TimelineLayerState;
  timelineMode: TimelineMode;
}): FramePreviewRenderModel {
  const timelineLayerState = withRequiredTimelineLayerTypes(timelineLayers);
  const visibleAdjustmentLayers = getExecutableAdjustmentLayers(
    scene.adjustmentLayers,
    timelineLayerState,
  );
  const renderableScene = getRenderableScene(scene, timelineLayerState);
  const timeline = buildLinearTimeline(renderableScene);
  const sceneDurationSeconds = getSceneDuration(renderableScene);
  const adjustedSceneTime = applyAdjustmentLayersToSceneTime(
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
  const sceneMotionViews = getMotionMarkerViews(renderableScene);
  const shiftedMotionMarkers = getShiftedSceneMotionMarkers(
    sceneMotionViews.motionMarkers,
    partStart,
  );
  const motionLayers = timelineLayerState.motionLayers?.length
    ? timelineLayerState.motionLayers
    : defaultTimelineLayerState.motionLayers!;
  const previewParts = withSceneMotionPreviewParts(
    previewState.previewParts,
    sceneMotionViews.motionMarkers,
  );
  const transitionPreviewParts = previewState.transitionPreviewParts
    ? {
        ...previewState.transitionPreviewParts,
        from: withSceneMotionPreviewParts(
          previewState.transitionPreviewParts.from,
          sceneMotionViews.motionMarkers,
        ),
        to: withSceneMotionPreviewParts(
          previewState.transitionPreviewParts.to,
          sceneMotionViews.motionMarkers,
        ),
      }
    : null;

  return {
    activeComposition: previewState.activeComposition,
    activeTimelinePart,
    adjustedSceneTime,
    hiddenMotionLayerIds: new Set(
      motionLayers.filter((layer) => layer.hidden).map((layer) => layer.id),
    ),
    motionLayers,
    part: { ...basePart, motionMarkers: shiftedMotionMarkers },
    previewParts,
    previewTime: previewState.previewTime,
    renderableScene,
    sceneDurationSeconds,
    timeline,
    timelineLayerState,
    transitionLayers: getExecutableTransitionLayers(
      scene.transitionLayers,
      timelineLayerState,
    ),
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
