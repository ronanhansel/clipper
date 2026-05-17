import { useMemo } from "react";
import { createAgentContext } from "../../core/agentContext";
import {
  cameraTranslationToFramePoint,
  CAMERA_PERSPECTIVE,
  getLayeredCameraPreviewTransform,
  type CameraPreviewTransform,
} from "../../core/camera";
import { getMotionMarkerViews } from "../../core/motionEffects";
import {
  defaultAssets,
  defaultTimelineLayerState,
  getSceneFromProject,
  withRequiredTimelineLayerTypes,
} from "../../core/project";
import {
  getMiddleTransitionMode,
  getSelectedActiveMiddleMend,
  getSelectedMotionMiddleSnap,
  getTimelineMarkerMendLayerId,
  getMotionMarkerMendKey,
  getMotionMiddleSnap,
  isMotionMiddleSnapActive,
  validateScene,
  type TimelineMendMarker,
} from "../../core/timeline";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type CompositionClip,
  type MotionEase,
  type ProjectManifest,
  type Scene,
  type SelectionPayload,
  type TimelineLayerState,
  type TimelineMode,
} from "../../core/types";
import { TIMELINE_MOTION_PART_ID } from "../types";
import type { MotionMarkerSelection } from "../types";
import {
  deriveFramePreviewRenderModelFromContext,
  deriveFramePreviewSceneContext,
  getFramePreviewTimelineLayers,
  resolveDisplayTimeAndPart,
} from "./framePreviewRenderModel";

const IDENTITY_CAMERA_PREVIEW: CameraPreviewTransform = {
  x: 0,
  y: 0,
  z: 0,
  scale: 1,
  rotation: 0,
  rotateX: 0,
  rotateY: 0,
  perspective: CAMERA_PERSPECTIVE,
  motionBlur: 0,
};

export function useEditorDerivedState({
  currentSceneTime,
  focusPickZoomMarker,
  framePickPreviewPoint,
  previewTransitionLayers,
  positionPickTranslationMarker,
  project,
  selectedObjectId,
  selectedAdjustmentLayerId,
  selectedPartId,
  selectedSceneId,
  selectedMotionMarker,
  selectedMotionMarkers,
  selectionPayload,
  timelineMode,
  timelineLayers,
}: {
  currentSceneTime: number;
  focusPickZoomMarker: { partId: string; markerId: string } | null;
  framePickPreviewPoint: ReturnType<
    typeof cameraTranslationToFramePoint
  > | null;
  previewTransitionLayers?: Scene["transitionLayers"];
  positionPickTranslationMarker: { partId: string; markerId: string } | null;
  project: ProjectManifest;
  selectedObjectId: string | null;
  selectedAdjustmentLayerId: string | null;
  selectedPartId: string;
  selectedSceneId: string;
  selectedMotionMarker: { partId: string; markerId: string } | null;
  selectedMotionMarkers: MotionMarkerSelection[];
  selectionPayload: SelectionPayload | null;
  timelineMode: TimelineMode;
  timelineLayers?: TimelineLayerState;
}) {
  const scene = useMemo(
    () => getSceneFromProject(project, selectedSceneId) ?? blankScene,
    [project, selectedSceneId],
  );
  const assets = project.assets ?? defaultAssets;
  const timelineLayerState = useMemo(
    () =>
      withRequiredTimelineLayerTypes(
        timelineLayers ??
          getFramePreviewTimelineLayers(project, selectedSceneId) ??
          defaultTimelineLayerState,
      ),
    [project, selectedSceneId, timelineLayers],
  );
  const previewSceneContext = useMemo(
    () =>
      deriveFramePreviewSceneContext({
        blankPart: blankPreviewComposition,
        previewTransitionLayers,
        scene,
        timelineLayers: timelineLayerState,
        timelineMode,
      }),
    [previewTransitionLayers, scene, timelineLayerState, timelineMode],
  );
  const renderableScene = previewSceneContext.renderableScene;
  const sceneDurationSeconds = previewSceneContext.sceneDurationSeconds;
  const motionLayers = previewSceneContext.motionLayers;
  const hiddenMotionLayerIds = previewSceneContext.hiddenMotionLayerIds;
  const timeline = previewSceneContext.timeline;

  const selectedPart = useMemo(
    () => scene.compositions.find((item) => item.id === selectedPartId) ?? null,
    [scene.compositions, selectedPartId],
  );
  const selectedAdjustmentLayer = useMemo(
    () =>
      scene.adjustmentLayers?.find(
        (layer) => layer.id === selectedAdjustmentLayerId,
      ) ?? null,
    [scene.adjustmentLayers, selectedAdjustmentLayerId],
  );

  const sceneMotionViews = useMemo(
    () => getMotionMarkerViews(renderableScene),
    [renderableScene],
  );
  const timelineMotionPart: CompositionClip = useMemo(
    () => ({
      ...blankPreviewComposition,
      id: TIMELINE_MOTION_PART_ID,
      name: "Timeline motion",
      duration: Math.max(sceneDurationSeconds, 0.1),
      motionMarkers: scene.motionMarkers ?? [],
    }),
    [scene.motionMarkers, sceneDurationSeconds],
  );
  const selectedMotionPart = useMemo(
    () =>
      selectedMotionMarker?.partId === TIMELINE_MOTION_PART_ID
        ? timelineMotionPart
        : (scene.compositions.find(
            (item) => item.id === selectedMotionMarker?.partId,
          ) ?? null),
    [scene.compositions, selectedMotionMarker?.partId, timelineMotionPart],
  );
  const selectedMotionViews = useMemo(
    () =>
      selectedMotionPart ? getMotionMarkerViews(selectedMotionPart) : null,
    [selectedMotionPart],
  );
  const selectedMotion = useMemo(
    () =>
      selectedMotionPart && selectedMotionMarker
        ? (selectedMotionViews?.motionMarkers.find(
            (marker) => marker.id === selectedMotionMarker.markerId,
          ) ?? null)
        : null,
    [selectedMotionMarker, selectedMotionPart, selectedMotionViews],
  );
  const validationErrors = useMemo(
    () => validateScene(renderableScene),
    [renderableScene],
  );

  const absoluteMotionMarkers = useMemo(
    () =>
      sceneMotionViews.motionMarkers.map((marker) => ({
        ...marker,
        id: timelineMarkerKey({
          partId: TIMELINE_MOTION_PART_ID,
          markerId: marker.id,
        }),
        rawMarkerId: marker.id,
        partId: TIMELINE_MOTION_PART_ID,
        start: marker.start,
      })),
    [sceneMotionViews.motionMarkers],
  );
  const selectedMotionPartSelectedMotionIds = useMemo(
    () =>
      selectedMotionPart
        ? selectedMotionMarkers
            .filter((selection) => selection.partId === selectedMotionPart.id)
            .map(timelineMarkerKey)
        : [],
    [selectedMotionMarkers, selectedMotionPart],
  );
  const selectedMotionSnapMarkers = useMemo(
    () =>
      selectedMotionMarkers.flatMap((selection) => {
        const markerPart = scene.compositions.find(
          (item) => item.id === selection.partId,
        );
        const marker =
          selection.partId === TIMELINE_MOTION_PART_ID
            ? sceneMotionViews.motionMarkers.find(
                (item) => item.id === selection.markerId,
              )
            : markerPart
              ? getMotionMarkerViews(markerPart).motionMarkers.find(
                  (item) => item.id === selection.markerId,
                )
              : undefined;
        return marker ? [marker] : [];
      }),
    [scene.compositions, sceneMotionViews.motionMarkers, selectedMotionMarkers],
  );
  const selectedMotionSnapInActive =
    selectedMotionSnapMarkers.length > 1
      ? selectedMotionSnapMarkers.every((marker) => marker.snapIn)
      : Boolean(selectedMotion?.snapIn);
  const selectedMotionSnapOutActive =
    selectedMotionSnapMarkers.length > 1
      ? selectedMotionSnapMarkers.every((marker) => marker.snapOut)
      : Boolean(selectedMotion?.snapOut);
  const selectedMotionPartMiddleSnap = useMemo(
    () =>
      selectedMotionPart
        ? (getSelectedActiveMiddleMend(
            absoluteMotionMarkers,
            selectedMotionPartSelectedMotionIds,
            getMotionMarkerMendKey,
          ) ??
          (selectedMotionPartSelectedMotionIds.length > 1
            ? getSelectedMotionMiddleSnap(
                absoluteMotionMarkers,
                selectedMotionPartSelectedMotionIds,
                getMotionMarkerMendKey,
              )
            : null))
        : null,
    [
      absoluteMotionMarkers,
      selectedMotionPart,
      selectedMotionPartSelectedMotionIds,
    ],
  );
  const selectedMotionPartMiddleSnapActive = selectedMotionPart
    ? isMotionMiddleSnapActive(
        absoluteMotionMarkers,
        selectedMotionPartMiddleSnap,
      )
    : false;
  const selectedMotionPartMiddleTransitionMode = getMiddleTransitionMode(
    absoluteMotionMarkers,
    selectedMotionPartMiddleSnap,
  );
  const selectedMotionPartMiddleEase = getMiddleEase(
    absoluteMotionMarkers,
    selectedMotionPartMiddleSnap,
  );
  const inspectorMotionMiddleSnap = selectedMotionPartMiddleSnap;

  const adjustmentMarkers = useMemo<TimelineMendMarker[]>(
    () =>
      (scene.adjustmentLayers ?? []).map((layer) => ({
        id: layer.id,
        start: layer.start,
        duration: layer.duration,
        effectId: layer.effect.effectId,
        layerId: layer.layerId ?? layer.effect.effectId,
        snapIn: layer.snapIn,
        snapOut: layer.snapOut,
        mendInId: layer.mendInId,
        mendOutId: layer.mendOutId,
      })),
    [scene.adjustmentLayers],
  );
  const selectedAdjustmentIds = useMemo(
    () => (selectedAdjustmentLayerId ? [selectedAdjustmentLayerId] : []),
    [selectedAdjustmentLayerId],
  );
  const compositionMarkers = useMemo<TimelineMendMarker[]>(
    () =>
      scene.compositions.map((comp) => ({
        id: comp.id,
        start: comp.start ?? 0,
        duration: comp.duration,
        layerId: comp.layerId ?? "comp",
        snapIn: comp.snapIn,
        snapOut: comp.snapOut,
        mendInId: comp.mendInId,
        mendOutId: comp.mendOutId,
      })),
    [scene.compositions],
  );
  const selectedCompositionIds = useMemo(
    () => (selectedPartId ? [selectedPartId] : []),
    [selectedPartId],
  );

  const isPickingZoomFocus = Boolean(focusPickZoomMarker);
  const isPickingTranslationPosition = Boolean(positionPickTranslationMarker);
  const canSelectFrameObjects = timelineMode === "compose";
  const persistedFramePickPoint =
    isPickingZoomFocus && selectedMotion
      ? selectedMotion.focus
      : isPickingTranslationPosition && selectedMotion?.position
        ? cameraTranslationToFramePoint(selectedMotion.position)
        : null;
  const framePickPoint = framePickPreviewPoint ?? persistedFramePickPoint;

  const previewRenderModel = useMemo(
    () =>
      deriveFramePreviewRenderModelFromContext(
        previewSceneContext,
        currentSceneTime,
        timelineMode,
      ),
    [currentSceneTime, previewSceneContext, timelineMode],
  );
  const adjustedSceneTime = previewRenderModel.adjustedSceneTime;
  const activeTimelinePart = previewRenderModel.activeTimelinePart;
  const activeComposition = previewRenderModel.activeComposition;
  const hasActiveComposition = Boolean(activeComposition);
  const previewParts = previewRenderModel.previewParts;
  const transitionPreviewParts = previewRenderModel.transitionPreviewParts;

  const composeFilePart = useMemo(
    () =>
      timelineMode === "compose"
        ? getComposeFilePart(project, activeComposition ?? selectedPart)
        : null,
    [activeComposition, project, selectedPart, timelineMode],
  );
  const displayResolution = useMemo(
    () =>
      resolveDisplayTimeAndPart({
        composeFilePart,
        model: previewRenderModel,
        selectedPart,
        sceneTime: currentSceneTime,
        timelineMode,
      }),
    [
      composeFilePart,
      currentSceneTime,
      previewRenderModel,
      selectedPart,
      timelineMode,
    ],
  );
  const displayPart = displayResolution.displayPart;
  const displayPreviewTime = displayResolution.displayPreviewTime;

  const selectedObject = useMemo(
    () =>
      displayPart.objects.find((object) => object.id === selectedObjectId) ??
      displayPart.background.elements.find(
        (object) => object.id === selectedObjectId,
      ) ??
      null,
    [displayPart, selectedObjectId],
  );
  const agentContext = useMemo(
    () => createAgentContext(project, scene, displayPart, selectionPayload),
    [project, scene, displayPart, selectionPayload],
  );

  const cameraPreviewTransform = useMemo(
    () =>
      timelineMode === "composition"
        ? getLayeredCameraPreviewTransform(
            displayPart,
            motionLayers,
            displayPreviewTime,
            {
              hiddenLayerIds: hiddenMotionLayerIds,
              pickingTranslationPosition: isPickingTranslationPosition,
              pickingZoomFocus: isPickingZoomFocus,
            },
          )
        : IDENTITY_CAMERA_PREVIEW,
    [
      displayPart,
      displayPreviewTime,
      hiddenMotionLayerIds,
      isPickingTranslationPosition,
      isPickingZoomFocus,
      motionLayers,
      timelineMode,
    ],
  );
  const zoomScale = cameraPreviewTransform.scale;

  const currentPartSelectedMotionIds = useMemo(
    () =>
      selectedMotionMarkers
        .filter((selection) => selection.partId === displayPart.id)
        .map(timelineMarkerKey),
    [displayPart.id, selectedMotionMarkers],
  );
  const selectedMotionMiddleSnap =
    getSelectedActiveMiddleMend(
      absoluteMotionMarkers,
      currentPartSelectedMotionIds,
      getMotionMarkerMendKey,
    ) ??
    (currentPartSelectedMotionIds.length > 1
      ? getSelectedMotionMiddleSnap(
          absoluteMotionMarkers,
          currentPartSelectedMotionIds,
          getMotionMarkerMendKey,
        )
      : null);
  const motionMiddleSnap =
    selectedMotionMiddleSnap ??
    getMotionMiddleSnap(
      absoluteMotionMarkers,
      adjustedSceneTime,
      getMotionMarkerMendKey,
    );
  const inspectorAdjustmentMiddleSnap =
    getSelectedActiveMiddleMend(
      adjustmentMarkers,
      selectedAdjustmentIds,
      getTimelineMarkerMendLayerId,
    ) ??
    getSelectedMotionMiddleSnap(
      adjustmentMarkers,
      selectedAdjustmentIds,
      getTimelineMarkerMendLayerId,
    ) ??
    getMotionMiddleSnap(
      adjustmentMarkers,
      currentSceneTime,
      getTimelineMarkerMendLayerId,
    );
  const inspectorCompositionMiddleSnap =
    getSelectedActiveMiddleMend(compositionMarkers, selectedCompositionIds) ??
    getSelectedMotionMiddleSnap(compositionMarkers, selectedCompositionIds) ??
    getMotionMiddleSnap(compositionMarkers, currentSceneTime);

  return {
    activeTimelinePart,
    adjustedSceneTime,
    agentContext,
    assets,
    cameraPreviewTransform,
    canSelectFrameObjects,
    framePickPoint,
    hasActiveComposition,
    inspectorAdjustmentMiddleSnap,
    inspectorCompositionMiddleSnap,
    inspectorMotionMiddleSnap,
    isPickingTranslationPosition,
    isPickingZoomFocus,
    composeFilePart,
    part: displayPart,
    previewSceneContext,
    previewTime: displayPreviewTime,
    previewParts,
    renderableScene,
    transitionPreviewParts,
    scene,
    sceneDurationSeconds,
    selectedObject,
    selectedAdjustmentLayer,
    selectedPart,
    selectedMotion,
    selectedMotionPart,
    selectedMotionPartMiddleSnapActive,
    selectedMotionPartMiddleEase,
    selectedMotionPartMiddleTransitionMode,
    selectedMotionSnapInActive,
    selectedMotionSnapMarkers,
    selectedMotionSnapOutActive,
    selectedZoom: selectedMotion,
    selectedZoomPart: selectedMotionPart,
    selectedZoomPartMiddleSnapActive: selectedMotionPartMiddleSnapActive,
    selectedZoomPartMiddleEase: selectedMotionPartMiddleEase,
    selectedZoomPartMiddleTransitionMode:
      selectedMotionPartMiddleTransitionMode,
    selectedZoomSnapInActive: selectedMotionSnapInActive,
    selectedZoomSnapMarkers: selectedMotionSnapMarkers,
    selectedZoomSnapOutActive: selectedMotionSnapOutActive,
    selectedTranslation: selectedMotion,
    selectedTranslationPart: selectedMotionPart,
    selectedTranslationPartMiddleSnapActive: selectedMotionPartMiddleSnapActive,
    selectedTranslationPartMiddleEase: selectedMotionPartMiddleEase,
    selectedTranslationPartMiddleTransitionMode:
      selectedMotionPartMiddleTransitionMode,
    selectedTranslationSnapInActive: selectedMotionSnapInActive,
    selectedTranslationSnapMarkers: selectedMotionSnapMarkers,
    selectedTranslationSnapOutActive: selectedMotionSnapOutActive,
    inspectorZoomMiddleSnap: inspectorMotionMiddleSnap,
    inspectorTranslationMiddleSnap: inspectorMotionMiddleSnap,
    zoomMiddleSnap: motionMiddleSnap,
    translationMiddleSnap: motionMiddleSnap,
    timeline,
    validationErrors,
    zoomScale,
  };
}

function getComposeFilePart(
  project: ProjectManifest,
  timelinePart: CompositionClip | null,
) {
  if (!timelinePart) return null;
  const composition = [
    ...(project.compositionLibrary ?? []),
    ...(project.compositions ?? []),
  ].find(
    (item) =>
      item.id === timelinePart.compositionId ||
      item.id === timelinePart.id ||
      item.filePath === timelinePart.filePath,
  );
  if (!composition) return null;
  return {
    ...composition,
    start: undefined,
    trimStart: undefined,
    layerId: undefined,
    prerender: undefined,
    compositionId: composition.id,
  } satisfies CompositionClip;
}

const blankPreviewComposition: CompositionClip = {
  id: "__blank_preview__",
  filePath: "",
  duration: 1,
  frame: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    style: {},
  },
  background: {
    id: "background",
    name: "Background",
    style: {},
    elements: [],
  },
  objects: [],
  snapshot: [],
  motionMarkers: [],
};

const blankScene: Scene = {
  id: "",
  adjustmentLayers: [],
  motionMarkers: [],
  transitionLayers: [],
  compositions: [],
};

function getMiddleEase(
  markers: Array<{ id: string; middleEase?: MotionEase }>,
  snap: { pairs: Array<{ nextId: string }> } | null,
): MotionEase | undefined {
  if (!snap) return undefined;
  const markersById = new Map(markers.map((marker) => [marker.id, marker]));
  const eases = new Set(
    snap.pairs
      .map((pair) => markersById.get(pair.nextId)?.middleEase)
      .filter((ease): ease is MotionEase => Boolean(ease)),
  );
  return eases.size === 1 ? [...eases][0] : undefined;
}

function timelineMarkerKey(selection: { partId: string; markerId: string }) {
  return `${selection.partId}:${selection.markerId}`;
}
