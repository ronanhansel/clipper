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
  const visibleAdjustmentLayers = sceneAdjustmentLayers;
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
  const transitionPreviewParts = previewState.transitionPreviewParts
    ? {
        from: previewState.transitionPreviewParts.from,
        to: previewState.transitionPreviewParts.to,
        fromSceneTime: previewState.transitionPreviewParts.fromSceneTime,
        toSceneTime: previewState.transitionPreviewParts.toSceneTime,
      }
    : null;
  const basePart = previewState.activeComposition ?? blankPart;
  const partStart = previewState.activeTimelinePart?.start ?? 0;
  const shiftedMotionMarkers = motionBlocksToMotionMarkers(
    sceneMotionMarkers.map((marker) => ({
      ...marker,
      start: marker.start - partStart,
    })),
  );
  return {
    activeComposition: previewState.activeComposition,
    activeTimelinePart: previewState.activeTimelinePart,
    adjustedSceneTime,
    hiddenMotionLayerIds,
    motionLayers,
    part: { ...basePart, motionMarkers: shiftedMotionMarkers },
    previewParts: previewState.previewParts,
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

export type DisplayTimeAndPart = {
  displayPart: CompositionClip;
  displayPreviewTime: number;
  partStart: number;
};

/**
 * Resolves the part + previewTime + partStart that should drive the on-screen
 * frame. Single source of truth for the compose-vs-direct projection — called
 * from both editorDerivedState (idle path, structural rerenders) and
 * FramePreviewLive (per-tick subscription).
 */
export function resolveDisplayTimeAndPart({
  composeFilePart,
  model,
  selectedPart,
  sceneTime,
  timelineMode,
}: {
  composeFilePart: CompositionClip | null;
  model: Pick<
    FramePreviewRenderModel,
    "activeComposition" | "activeTimelinePart" | "part" | "previewTime"
  >;
  selectedPart: CompositionClip | null;
  sceneTime: number;
  timelineMode: TimelineMode;
}): DisplayTimeAndPart {
  const composeMode = timelineMode === "compose";
  const composePreviewTime = composeMode
    ? Math.min(
        Math.max(
          model.activeTimelinePart
            ? sceneTime -
                (model.activeTimelinePart.start ?? 0) +
                (model.activeTimelinePart.trimStart ?? 0)
            : sceneTime,
          0,
        ),
        (model.activeComposition ?? selectedPart)?.duration ?? 0,
      )
    : model.previewTime;
  const displayPart = composeFilePart ?? model.part;
  const displayPreviewTime =
    composeFilePart && composeMode ? composePreviewTime : model.previewTime;
  const partStart = composeMode ? 0 : (model.activeTimelinePart?.start ?? 0);
  return { displayPart, displayPreviewTime, partStart };
}
