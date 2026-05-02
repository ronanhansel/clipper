import { useMemo } from "react";
import { createAgentContext } from "../../core/agentContext";
import { applyAdjustmentLayersToSceneTime } from "../../core/adjustments";
import { cameraTranslationToFramePoint, CAMERA_PERSPECTIVE, getLayeredCameraPreviewTransform, type CameraPreviewTransform } from "../../core/camera";
import { clamp } from "../../core/math";
import { getMotionMarkerViews, motionBlocksToMotionMarkers } from "../../core/motionEffects";
import { defaultAssets, defaultTimelineLayerState, getSceneFromProject, serializeProjectForSave } from "../../core/project";
import { buildLinearTimeline, getExecutableAdjustmentLayers, getMiddleTransitionMode, getRenderableScene, getSelectedActiveMiddleMend, getSelectedMotionMiddleSnap, getTimelineMarkerMendLayerId, getTopTimelinePartAtTime, getMotionMarkerMendKey, getMotionMiddleSnap, isMotionMiddleSnapActive, sceneDuration as getSceneDuration, validateScene, type TimelineMendMarker } from "../../core/timeline";
import { FRAME_HEIGHT, FRAME_WIDTH, type CompositionClip, type MotionEase, type MotionMarker, type ProjectManifest, type Scene, type SelectionPayload, type TimelineMode, type TimelinePart } from "../../core/types";
import { TIMELINE_MOTION_PART_ID } from "../types";
import type { MotionMarkerSelection } from "../types";
import { getProjectContentSnapshot } from "./projectStore";

export function useEditorDerivedState({
  currentSceneTime,
  focusPickZoomMarker,
  framePickPreviewPoint,
  compositionSources,
  positionPickTranslationMarker,
  project,
  savedCompositionSourcesSnapshot,
  savedProjectSnapshot,
  selectedObjectId,
  selectedAdjustmentLayerId,
  selectedPartId,
  selectedSceneId,
  selectedMotionMarker,
  selectedMotionMarkers,
  selectionPayload,
  timelineMode,
}: {
  currentSceneTime: number;
  focusPickZoomMarker: { partId: string; markerId: string } | null;
  framePickPreviewPoint: ReturnType<typeof cameraTranslationToFramePoint> | null;
  compositionSources: Record<string, string>;
  positionPickTranslationMarker: { partId: string; markerId: string } | null;
  project: ProjectManifest;
  savedCompositionSourcesSnapshot: string;
  savedProjectSnapshot: string;
  selectedObjectId: string | null;
  selectedAdjustmentLayerId: string | null;
  selectedPartId: string;
  selectedSceneId: string;
  selectedMotionMarker: { partId: string; markerId: string } | null;
  selectedMotionMarkers: MotionMarkerSelection[];
  selectionPayload: SelectionPayload | null;
  timelineMode: TimelineMode;
}) {
  const scene = useMemo(() => getSceneFromProject(project, selectedSceneId) ?? blankScene, [project, selectedSceneId]);
  const assets = project.assets ?? defaultAssets;
  const timelineLayerState = project.editorState?.timelineLayers ?? defaultTimelineLayerState;
  const visibleAdjustmentLayers = getExecutableAdjustmentLayers(scene.adjustmentLayers, timelineLayerState);
  const renderableScene = useMemo(() => getRenderableScene(scene, timelineLayerState), [scene, timelineLayerState]);
  const timeline = useMemo(() => buildLinearTimeline(renderableScene), [renderableScene]);
  const sceneDurationSeconds = getSceneDuration(renderableScene);
  const adjustedSceneTime = applyAdjustmentLayersToSceneTime(currentSceneTime, visibleAdjustmentLayers);
  const compositionLookupTime = timelineMode === "compose" ? currentSceneTime : adjustedSceneTime;
  const timelinePartLookupTime = timelineMode === "compose" && compositionLookupTime > 0 ? compositionLookupTime - 0.000001 : compositionLookupTime;
  const timelinePartAtTime = getTopTimelinePartAtTime(timeline, timelinePartLookupTime, timelineLayerState);
  const activeTimelinePart = timelinePartAtTime;
  const activeComposition = activeTimelinePart ? scene.compositions.find((item) => item.id === activeTimelinePart.id) ?? null : null;
  const basePart = activeComposition ?? blankPreviewComposition;
  const sceneMotionViews = useMemo(() => getMotionMarkerViews(scene), [scene.motionMarkers]);
  const part = useMemo(() => {
    const partStart = activeTimelinePart?.start ?? 0;
    const shiftedMotionMarkers = motionBlocksToMotionMarkers(sceneMotionViews.motionMarkers.map((marker) => ({ ...marker, start: marker.start - partStart })));
    return {
      ...basePart,
      motionMarkers: shiftedMotionMarkers,
    };
  }, [activeTimelinePart?.start, basePart, sceneMotionViews.motionMarkers]);
  const hasActiveComposition = Boolean(activeComposition);
  const previewTime = activeTimelinePart ? clamp(compositionLookupTime - activeTimelinePart.start, 0, part.duration) : 0;
  const selectedAdjustmentLayer = scene.adjustmentLayers?.find((layer) => layer.id === selectedAdjustmentLayerId) ?? null;
  const selectedObject = part.objects.find((object) => object.id === selectedObjectId) ?? part.background.elements.find((object) => object.id === selectedObjectId) ?? null;
  const timelineMotionPart: CompositionClip = useMemo(() => ({
    ...blankPreviewComposition,
    id: TIMELINE_MOTION_PART_ID,
    name: "Timeline motion",
    duration: Math.max(sceneDurationSeconds, 0.1),
    motionMarkers: scene.motionMarkers ?? [],
  }), [scene.motionMarkers, sceneDurationSeconds]);
  const selectedMotionPart = selectedMotionMarker?.partId === TIMELINE_MOTION_PART_ID ? timelineMotionPart : scene.compositions.find((item) => item.id === selectedMotionMarker?.partId) ?? null;
  const selectedMotionViews = selectedMotionPart ? getMotionMarkerViews(selectedMotionPart) : null;
  const selectedMotion = selectedMotionPart && selectedMotionMarker ? selectedMotionViews?.motionMarkers.find((marker) => marker.id === selectedMotionMarker.markerId) ?? null : null;
  const selectedZoomPart = selectedMotionViews?.motionMarkers.some((marker) => marker.id === selectedMotionMarker?.markerId) ? selectedMotionPart : null;
  const selectedZoom = selectedZoomPart ? selectedMotionViews?.motionMarkers.find((marker) => marker.id === selectedMotionMarker?.markerId) ?? null : null;
  const selectedTranslationPart = selectedMotionViews?.motionMarkers.some((marker) => marker.id === selectedMotionMarker?.markerId) ? selectedMotionPart : null;
  const selectedTranslation = selectedTranslationPart ? selectedMotionViews?.motionMarkers.find((marker) => marker.id === selectedMotionMarker?.markerId) ?? null : null;
  const selectedPart = scene.compositions.find((item) => item.id === selectedPartId) ?? null;
  const validationErrors = useMemo(() => validateScene(renderableScene), [renderableScene]);
  const motionLayers = project.editorState?.timelineLayers?.motionLayers?.length ? project.editorState.timelineLayers.motionLayers : defaultTimelineLayerState.motionLayers!;
  const hiddenMotionLayerIds = useMemo(() => new Set(motionLayers.filter((layer) => layer.hidden).map((layer) => layer.id)), [motionLayers]);
  const agentContext = useMemo(() => createAgentContext(project, scene, part, selectionPayload), [project, scene, part, selectionPayload]);
  const persistedProject = useMemo(() => serializeProjectForSave({ ...project, compositionSources }), [compositionSources, project]);
  const projectSnapshot = useMemo(() => getProjectContentSnapshot(persistedProject), [persistedProject]);
  const editorStateSnapshot = useMemo(() => JSON.stringify(project.editorState), [project.editorState]);
  const compositionSourcesSnapshot = useMemo(() => JSON.stringify(persistedProject.compositionSources ?? {}), [persistedProject.compositionSources]);
  const hasUnsavedProjectChanges = projectSnapshot !== savedProjectSnapshot;
  const hasUnsavedSourceChanges = compositionSourcesSnapshot !== savedCompositionSourcesSnapshot;
  const hasUnsavedChanges = hasUnsavedProjectChanges || hasUnsavedSourceChanges;
  const isPickingZoomFocus = Boolean(focusPickZoomMarker);
  const isPickingTranslationPosition = Boolean(positionPickTranslationMarker);
  const canSelectFrameObjects = timelineMode === "compose";
  const persistedFramePickPoint = isPickingZoomFocus && selectedZoom ? selectedZoom.focus : isPickingTranslationPosition && selectedTranslation?.position ? cameraTranslationToFramePoint(selectedTranslation.position) : null;
  const framePickPoint = framePickPreviewPoint ?? persistedFramePickPoint;
  const identityCameraPreview: CameraPreviewTransform = { x: 0, y: 0, z: 0, scale: 1, rotation: 0, rotateX: 0, rotateY: 0, perspective: CAMERA_PERSPECTIVE };
  const cameraPreviewTransform = useMemo(() => timelineMode === "composition"
    ? getLayeredCameraPreviewTransform(part, motionLayers, previewTime, { hiddenLayerIds: hiddenMotionLayerIds, pickingTranslationPosition: isPickingTranslationPosition, pickingZoomFocus: isPickingZoomFocus })
    : identityCameraPreview, [hiddenMotionLayerIds, isPickingTranslationPosition, isPickingZoomFocus, motionLayers, previewTime, part, timelineMode]);
  const zoomScale = cameraPreviewTransform.scale;
  const absoluteMotionMarkers = useMemo(() => sceneMotionViews.motionMarkers.map((marker) => ({ ...marker, id: timelineMarkerKey({ partId: TIMELINE_MOTION_PART_ID, markerId: marker.id }), rawMarkerId: marker.id, partId: TIMELINE_MOTION_PART_ID, start: marker.start })), [sceneMotionViews.motionMarkers]);
  const currentPartSelectedMotionIds = useMemo(() => selectedMotionMarkers.filter((selection) => selection.partId === part.id).map(timelineMarkerKey), [part.id, selectedMotionMarkers]);
  const selectedMotionPartSelectedMotionIds = useMemo(() => selectedMotionPart ? selectedMotionMarkers.filter((selection) => selection.partId === selectedMotionPart.id).map(timelineMarkerKey) : [], [selectedMotionMarkers, selectedMotionPart]);
  const selectedMotionSnapMarkers = useMemo(() => selectedMotionMarkers.flatMap((selection) => {
    const markerPart = scene.compositions.find((item) => item.id === selection.partId);
    const marker = selection.partId === TIMELINE_MOTION_PART_ID ? sceneMotionViews.motionMarkers.find((item) => item.id === selection.markerId) : markerPart ? getMotionMarkerViews(markerPart).motionMarkers.find((item) => item.id === selection.markerId) : undefined;
    return marker ? [marker] : [];
  }), [scene.compositions, sceneMotionViews.motionMarkers, selectedMotionMarkers]);
  const selectedMotionSnapInActive = selectedMotionSnapMarkers.length > 1 ? selectedMotionSnapMarkers.every((marker) => marker.snapIn) : Boolean(selectedMotion?.snapIn);
  const selectedMotionSnapOutActive = selectedMotionSnapMarkers.length > 1 ? selectedMotionSnapMarkers.every((marker) => marker.snapOut) : Boolean(selectedMotion?.snapOut);
  const selectedMotionMiddleSnap = getSelectedActiveMiddleMend(absoluteMotionMarkers, currentPartSelectedMotionIds, getMotionMarkerMendKey) ?? (currentPartSelectedMotionIds.length > 1 ? getSelectedMotionMiddleSnap(absoluteMotionMarkers, currentPartSelectedMotionIds, getMotionMarkerMendKey) : null);
  const selectedMotionPartMiddleSnap = selectedMotionPart ? getSelectedActiveMiddleMend(absoluteMotionMarkers, selectedMotionPartSelectedMotionIds, getMotionMarkerMendKey) ?? (selectedMotionPartSelectedMotionIds.length > 1 ? getSelectedMotionMiddleSnap(absoluteMotionMarkers, selectedMotionPartSelectedMotionIds, getMotionMarkerMendKey) : null) : null;
  const selectedMotionPartMiddleSnapActive = selectedMotionPart ? isMotionMiddleSnapActive(absoluteMotionMarkers, selectedMotionPartMiddleSnap) : false;
  const selectedMotionPartMiddleTransitionMode = getMiddleTransitionMode(absoluteMotionMarkers, selectedMotionPartMiddleSnap);
  const selectedMotionPartMiddleEase = getMiddleEase(absoluteMotionMarkers, selectedMotionPartMiddleSnap);
  const motionMiddleSnap = selectedMotionMiddleSnap ?? getMotionMiddleSnap(absoluteMotionMarkers, adjustedSceneTime, getMotionMarkerMendKey);
  const inspectorMotionMiddleSnap = selectedMotionPartMiddleSnap;

  const adjustmentMarkers = useMemo<TimelineMendMarker[]>(() => (scene.adjustmentLayers ?? []).map((layer) => ({
    id: layer.id,
    start: layer.start,
    duration: layer.duration,
    effectId: layer.effect.effectId,
    layerId: layer.layerId ?? layer.effect.effectId,
    snapIn: layer.snapIn,
    snapOut: layer.snapOut,
    mendInId: layer.mendInId,
    mendOutId: layer.mendOutId,
  })), [scene.adjustmentLayers]);
  const selectedAdjustmentIds = useMemo(() => selectedAdjustmentLayerId ? [selectedAdjustmentLayerId] : [], [selectedAdjustmentLayerId]);
  const inspectorAdjustmentMiddleSnap = getSelectedActiveMiddleMend(adjustmentMarkers, selectedAdjustmentIds, getTimelineMarkerMendLayerId)
    ?? getSelectedMotionMiddleSnap(adjustmentMarkers, selectedAdjustmentIds, getTimelineMarkerMendLayerId)
    ?? getMotionMiddleSnap(adjustmentMarkers, currentSceneTime, getTimelineMarkerMendLayerId);

  const compositionMarkers = useMemo<TimelineMendMarker[]>(() => scene.compositions.map((comp) => ({
    id: comp.id,
    start: comp.start ?? 0,
    duration: comp.duration,
    layerId: comp.layerId ?? "comp",
    snapIn: comp.snapIn,
    snapOut: comp.snapOut,
    mendInId: comp.mendInId,
    mendOutId: comp.mendOutId,
  })), [scene.compositions]);
  const selectedCompositionIds = useMemo(() => selectedPartId ? [selectedPartId] : [], [selectedPartId]);
  const inspectorCompositionMiddleSnap = getSelectedActiveMiddleMend(compositionMarkers, selectedCompositionIds)
    ?? getSelectedMotionMiddleSnap(compositionMarkers, selectedCompositionIds)
    ?? getMotionMiddleSnap(compositionMarkers, currentSceneTime);

  return {
    activeTimelinePart,
    agentContext,
    assets,
    cameraPreviewTransform,
    canSelectFrameObjects,
    editorStateSnapshot,
    framePickPoint,
    hasUnsavedChanges,
    hasActiveComposition,
    inspectorAdjustmentMiddleSnap,
    inspectorCompositionMiddleSnap,
    inspectorMotionMiddleSnap,
    isPickingTranslationPosition,
    isPickingZoomFocus,
    part,
    compositionSourcesSnapshot,
    previewTime,
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
    selectedZoomPartMiddleTransitionMode: selectedMotionPartMiddleTransitionMode,
    selectedZoomSnapInActive: selectedMotionSnapInActive,
    selectedZoomSnapMarkers: selectedMotionSnapMarkers,
    selectedZoomSnapOutActive: selectedMotionSnapOutActive,
    selectedTranslation: selectedMotion,
    selectedTranslationPart: selectedMotionPart,
    selectedTranslationPartMiddleSnapActive: selectedMotionPartMiddleSnapActive,
    selectedTranslationPartMiddleEase: selectedMotionPartMiddleEase,
    selectedTranslationPartMiddleTransitionMode: selectedMotionPartMiddleTransitionMode,
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

const blankPreviewComposition: CompositionClip = {
  id: "__blank_preview__",
  filePath: "",
  duration: 1,
  frame: { width: FRAME_WIDTH, height: FRAME_HEIGHT, style: { background: "#050505" } },
  background: { id: "background", name: "Background", style: { background: "#050505" }, elements: [] },
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

function getMiddleEase(markers: Array<{ id: string; middleEase?: MotionEase }>, snap: { pairs: Array<{ nextId: string }> } | null): MotionEase | undefined {
  if (!snap) return undefined;
  const markersById = new Map(markers.map((marker) => [marker.id, marker]));
  const eases = new Set(snap.pairs.map((pair) => markersById.get(pair.nextId)?.middleEase).filter((ease): ease is MotionEase => Boolean(ease)));
  return eases.size === 1 ? [...eases][0] : undefined;
}

type AbsoluteMotionMarker = MotionMarker & { id: string; partId: string; start: number };

function timelineMarkerKey(selection: { partId: string; markerId: string }) {
  return `${selection.partId}:${selection.markerId}`;
}

function getAbsoluteTimelineMarkers(timeline: TimelinePart[]) {
  return timeline.flatMap((timelinePart) => getMotionMarkerViews(timelinePart).motionMarkers.map((marker) => ({
    ...marker,
    id: `${timelinePart.id}:${marker.id}`,
    partId: timelinePart.id,
    start: timelinePart.start + marker.start,
  })));
}
