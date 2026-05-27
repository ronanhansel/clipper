import { applyAdjustmentLayersToSceneTime } from "../../core/adjustments";
import {
  type SceneWrapConfig,
  sceneWrapConfigForMode,
} from "../../core/sceneWrap";
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
  getPreviewStackParts,
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

/**
 * Re-exported from `core/sceneWrap` so existing call sites keep their import
 * path. The canonical definition lives in core because the timeline preview
 * lookup, render model, and master clock all consult it — having it in core
 * removes the cycle between core/timeline.ts and app/state.
 */
export type { SceneWrapConfig };
export { sceneWrapConfigForMode };

export type FramePreviewRenderModel = {
  activeComposition: CompositionClip | null;
  activeTimelinePart: TimelinePart | null;
  adjustedSceneTime: number;
  hiddenMotionLayerIds: Set<string>;
  motionLayers: TimelineMotionLayerState[];
  part: CompositionClip;
  sceneWrap: SceneWrapConfig;
  /**
   * The composition that wraps scene-level motion markers, rebased into the
   * active part's local time. Read by the camera transform — never used to
   * mount the composition itself. The composition's own motion markers stay
   * on `part`.
   */
  sceneMotionPart: CompositionClip;
  previewParts: TimelinePreviewStackPart[];
  prewarmParts: TimelinePreviewStackPart[];
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
  const sceneWrap = sceneWrapConfigForMode(timelineMode);
  const adjustedSceneTime = sceneWrap.adjustmentsEnabled
    ? applyAdjustmentLayersToSceneTime(
        sceneTime,
        visibleAdjustmentLayers,
        frameRate,
      )
    : sceneTime;
  const previewState = getTimelinePreviewState({
    adjustmentLayers: [],
    compositions: renderableScene.compositions,
    sceneDurationSeconds,
    sceneTime: adjustedSceneTime,
    sceneWrap,
    timeline,
    timelineLayers: timelineLayerState,
    transitionLayers: renderableScene.transitionLayers,
  });
  const transitionPreviewParts =
    sceneWrap.transitionsEnabled && previewState.transitionPreviewParts
      ? {
          from: previewState.transitionPreviewParts.from,
          to: previewState.transitionPreviewParts.to,
          fromSceneTime: previewState.transitionPreviewParts.fromSceneTime,
          toSceneTime: previewState.transitionPreviewParts.toSceneTime,
        }
      : null;
  // Gap render: when the playhead sits in dead space between or beyond
  // compositions, there is no part to mount. `blankPart` is the explicit
  // black/empty stand-in — not a fallback for missing data.
  const gapPart = blankPart;
  const part = previewState.activeComposition ?? gapPart;
  const partStart = previewState.activeTimelinePart?.start ?? 0;
  const sceneMotionPart: CompositionClip = {
    ...blankPart,
    motionMarkers: sceneWrap.motionEnabled
      ? motionBlocksToMotionMarkers(
          sceneMotionMarkers.map((marker) => ({
            ...marker,
            start: marker.start - partStart,
          })),
        )
      : [],
  };
  const prewarmParts: TimelinePreviewStackPart[] = [];
  if (sceneWrap.transitionsEnabled && transitionLayers) {
    const prewarmWindowSeconds = 1.5;
    for (const layer of transitionLayers) {
      const isNearby =
        adjustedSceneTime >= layer.start - prewarmWindowSeconds &&
        adjustedSceneTime <=
          layer.start + layer.duration + prewarmWindowSeconds;
      if (isNearby) {
        const midTime = layer.start + layer.duration / 2;
        const fromTimeClamped = Math.min(
          Math.max(midTime - 0.05, layer.start),
          layer.start + layer.duration,
        );
        const toTimeClamped = Math.min(
          Math.max(midTime + 0.05, layer.start),
          layer.start + layer.duration,
        );

        const fromParts = getPreviewStackParts(
          renderableScene.compositions,
          timeline,
          fromTimeClamped,
          fromTimeClamped,
          timelineLayerState,
        );
        const toParts = getPreviewStackParts(
          renderableScene.compositions,
          timeline,
          toTimeClamped,
          toTimeClamped,
          timelineLayerState,
        );

        prewarmParts.push(...fromParts, ...toParts);
      }
    }
  }

  return {
    activeComposition: previewState.activeComposition,
    activeTimelinePart: previewState.activeTimelinePart,
    adjustedSceneTime,
    hiddenMotionLayerIds,
    motionLayers: sceneWrap.motionEnabled ? motionLayers : [],
    part,
    sceneWrap,
    sceneMotionPart,
    previewParts: previewState.previewParts,
    prewarmParts,
    previewTime: previewState.previewTime,
    renderableScene,
    sceneDurationSeconds,
    timeline,
    timelineLayerState,
    transitionLayers: sceneWrap.transitionsEnabled ? transitionLayers : [],
    transitionPreviewParts,
    visibleAdjustmentLayers: sceneWrap.adjustmentsEnabled
      ? visibleAdjustmentLayers
      : [],
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
 * frame. Single source of truth for both compose and direct — the model is
 * already mode-aware (it reads `timelineMode` when it derives the preview
 * state), so this function does no per-mode branching of its own.
 */
export function resolveDisplayTimeAndPart(
  model: Pick<
    FramePreviewRenderModel,
    "activeTimelinePart" | "part" | "previewTime"
  >,
): DisplayTimeAndPart {
  return {
    displayPart: model.part,
    displayPreviewTime: model.previewTime,
    partStart: model.activeTimelinePart?.start ?? 0,
  };
}
