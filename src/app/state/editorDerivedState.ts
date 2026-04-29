import { useMemo } from "react";
import { createAgentContext } from "../../core/agentContext";
import { applyAdjustmentLayersToSceneTime } from "../../core/adjustments";
import { cameraTranslationToFramePoint, getCameraPreviewTransform, getLayeredCameraPreviewTransform } from "../../core/camera";
import { clamp } from "../../core/math";
import { defaultAssets, defaultTimelineLayerState, serializeProjectForSave } from "../../core/project";
import { buildLinearTimeline, getExecutableAdjustmentLayers, getMiddleTransitionMode, getSelectedActiveMiddleMend, getSelectedZoomMiddleSnap, getTimelinePartAtTime, getTranslationMarkerMendKey, getZoomMarkerMendKey, getZoomMiddleSnap, isZoomMiddleSnapActive, sceneDuration as getSceneDuration, validateScene } from "../../core/timeline";
import { FRAME_HEIGHT, FRAME_WIDTH, type CompositionClip, type ProjectManifest, type SelectionPayload, type TimelineMode, type TimelinePart, type TranslationMarker, type ZoomMarker } from "../../core/types";
import type { TranslationMarkerSelection, ZoomMarkerSelection } from "../types";
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
  selectedTranslationMarker,
  selectedTranslationMarkers,
  selectedZoomMarker,
  selectedZoomMarkers,
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
  selectedTranslationMarker: { partId: string; markerId: string } | null;
  selectedTranslationMarkers: TranslationMarkerSelection[];
  selectedZoomMarker: { partId: string; markerId: string } | null;
  selectedZoomMarkers: ZoomMarkerSelection[];
  selectionPayload: SelectionPayload | null;
  timelineMode: TimelineMode;
}) {
  const scene = project.scenes.find((item) => item.id === selectedSceneId) ?? project.scenes[0];
  if (!scene) throw new Error("Project has no timelines.");
  const assets = project.assets ?? defaultAssets;
  const timelineLayerState = project.editorState?.timelineLayers ?? defaultTimelineLayerState;
  const visibleAdjustmentLayers = getExecutableAdjustmentLayers(scene.adjustmentLayers, timelineLayerState);
  const timeline = useMemo(() => buildLinearTimeline(scene), [scene]);
  const sceneDurationSeconds = getSceneDuration({ ...scene, adjustmentLayers: visibleAdjustmentLayers });
  const adjustedSceneTime = applyAdjustmentLayersToSceneTime(currentSceneTime, visibleAdjustmentLayers);
  const timelinePartAtTime = getTimelinePartAtTime(timeline, adjustedSceneTime);
  const activeTimelinePart = timelinePartAtTime;
  const activeComposition = activeTimelinePart ? scene.compositions.find((item) => item.id === activeTimelinePart.id) ?? null : null;
  const part = activeComposition ?? blankPreviewComposition;
  const hasActiveComposition = Boolean(activeComposition);
  const previewTime = activeTimelinePart ? clamp(adjustedSceneTime - activeTimelinePart.start, 0, part.duration) : 0;
  const selectedAdjustmentLayer = scene.adjustmentLayers?.find((layer) => layer.id === selectedAdjustmentLayerId) ?? null;
  const selectedObject = part.objects.find((object) => object.id === selectedObjectId) ?? null;
  const selectedZoomPart = scene.compositions.find((item) => item.id === selectedZoomMarker?.partId) ?? null;
  const selectedZoom = selectedZoomMarker?.partId === "__timeline_motion__" ? (scene.zoomMarkers ?? []).find((marker) => marker.id === selectedZoomMarker.markerId) ?? null : selectedZoomPart?.zoomMarkers.find((marker) => marker.id === selectedZoomMarker?.markerId) ?? null;
  const selectedTranslationPart = scene.compositions.find((item) => item.id === selectedTranslationMarker?.partId) ?? null;
  const selectedTranslation = selectedTranslationMarker?.partId === "__timeline_motion__" ? (scene.translationMarkers ?? []).find((marker) => marker.id === selectedTranslationMarker.markerId) ?? null : selectedTranslationPart?.translationMarkers.find((marker) => marker.id === selectedTranslationMarker?.markerId) ?? null;
  const selectedPart = scene.compositions.find((item) => item.id === selectedPartId) ?? null;
  const validationErrors = useMemo(() => validateScene({ ...scene, adjustmentLayers: visibleAdjustmentLayers }), [scene, visibleAdjustmentLayers]);
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
  const persistedFramePickPoint = isPickingZoomFocus && selectedZoom ? selectedZoom.focus : isPickingTranslationPosition && selectedTranslation ? cameraTranslationToFramePoint(selectedTranslation.position) : null;
  const framePickPoint = framePickPreviewPoint ?? persistedFramePickPoint;
  const sceneMotionPart = useMemo(() => {
    const partStart = activeTimelinePart?.start ?? 0;
    return {
      ...part,
      zoomMarkers: (scene.zoomMarkers ?? []).map((marker) => ({ ...marker, start: marker.start - partStart })),
      translationMarkers: (scene.translationMarkers ?? []).map((marker) => ({ ...marker, start: marker.start - partStart })),
    };
  }, [activeTimelinePart?.start, part, scene.translationMarkers, scene.zoomMarkers]);
  const cameraPreviewTransform = useMemo(() => timelineMode === "composition"
    ? getLayeredCameraPreviewTransform(sceneMotionPart, motionLayers, previewTime, { hiddenLayerIds: hiddenMotionLayerIds, pickingTranslationPosition: isPickingTranslationPosition, pickingZoomFocus: isPickingZoomFocus })
    : getCameraPreviewTransform(null, null), [hiddenMotionLayerIds, isPickingTranslationPosition, isPickingZoomFocus, motionLayers, previewTime, sceneMotionPart, timelineMode]);
  const zoomScale = cameraPreviewTransform.scale;
  const absoluteZoomMarkers = useMemo(() => (scene.zoomMarkers ?? []).map((marker) => ({ ...marker, partId: "__timeline_motion__", start: marker.start })), [scene.zoomMarkers]);
  const absoluteTranslationMarkers = useMemo(() => (scene.translationMarkers ?? []).map((marker) => ({ ...marker, partId: "__timeline_motion__", start: marker.start })), [scene.translationMarkers]);
  const currentPartSelectedZoomIds = useMemo(() => selectedZoomMarkers.filter((selection) => selection.partId === part.id).map(timelineMarkerKey), [part.id, selectedZoomMarkers]);
  const selectedZoomPartSelectedZoomIds = useMemo(() => selectedZoomPart ? selectedZoomMarkers.filter((selection) => selection.partId === selectedZoomPart.id).map(timelineMarkerKey) : [], [selectedZoomMarkers, selectedZoomPart]);
  const selectedZoomSnapMarkers = useMemo(() => selectedZoomMarkers.flatMap((selection) => {
    const zoomPart = scene.compositions.find((item) => item.id === selection.partId);
    const zoomMarker = selection.partId === "__timeline_motion__" ? (scene.zoomMarkers ?? []).find((item) => item.id === selection.markerId) : zoomPart?.zoomMarkers.find((item) => item.id === selection.markerId);
    return zoomMarker ? [zoomMarker] : [];
  }), [scene.compositions, scene.zoomMarkers, selectedZoomMarkers]);
  const selectedZoomSnapInActive = selectedZoomSnapMarkers.length > 1 ? selectedZoomSnapMarkers.every((marker) => marker.snapIn) : Boolean(selectedZoom?.snapIn);
  const selectedZoomSnapOutActive = selectedZoomSnapMarkers.length > 1 ? selectedZoomSnapMarkers.every((marker) => marker.snapOut) : Boolean(selectedZoom?.snapOut);
  const selectedZoomMiddleSnap = getSelectedActiveMiddleMend(absoluteZoomMarkers, currentPartSelectedZoomIds, getZoomMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteZoomMarkers, currentPartSelectedZoomIds, getZoomMarkerMendKey);
  const selectedZoomPartMiddleSnap = selectedZoomPart ? getSelectedActiveMiddleMend(absoluteZoomMarkers, selectedZoomPartSelectedZoomIds, getZoomMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteZoomMarkers, selectedZoomPartSelectedZoomIds, getZoomMarkerMendKey) : null;
  const selectedZoomPartMiddleSnapActive = selectedZoomPart ? isZoomMiddleSnapActive(absoluteZoomMarkers, selectedZoomPartMiddleSnap) : false;
  const selectedZoomPartMiddleTransitionMode = getMiddleTransitionMode(absoluteZoomMarkers, selectedZoomPartMiddleSnap);
  const zoomMiddleSnap = selectedZoomMiddleSnap ?? getZoomMiddleSnap(absoluteZoomMarkers, adjustedSceneTime, getZoomMarkerMendKey);
  const inspectorZoomMiddleSnap = selectedZoomPartMiddleSnap ?? (selectedZoomPart?.id === part.id ? zoomMiddleSnap : null);
  const currentPartSelectedTranslationIds = useMemo(() => selectedTranslationMarkers.filter((selection) => selection.partId === part.id).map(timelineMarkerKey), [part.id, selectedTranslationMarkers]);
  const selectedTranslationPartSelectedTranslationIds = useMemo(() => selectedTranslationPart ? selectedTranslationMarkers.filter((selection) => selection.partId === selectedTranslationPart.id).map(timelineMarkerKey) : [], [selectedTranslationMarkers, selectedTranslationPart]);
  const selectedTranslationSnapMarkers = useMemo(() => selectedTranslationMarkers.flatMap((selection) => {
    const translationPart = scene.compositions.find((item) => item.id === selection.partId);
    const translationMarker = selection.partId === "__timeline_motion__" ? (scene.translationMarkers ?? []).find((item) => item.id === selection.markerId) : translationPart?.translationMarkers.find((item) => item.id === selection.markerId);
    return translationMarker ? [translationMarker] : [];
  }), [scene.compositions, scene.translationMarkers, selectedTranslationMarkers]);
  const selectedTranslationSnapInActive = selectedTranslationSnapMarkers.length > 1 ? selectedTranslationSnapMarkers.every((marker) => marker.snapIn) : Boolean(selectedTranslation?.snapIn);
  const selectedTranslationSnapOutActive = selectedTranslationSnapMarkers.length > 1 ? selectedTranslationSnapMarkers.every((marker) => marker.snapOut) : Boolean(selectedTranslation?.snapOut);
  const selectedTranslationMiddleSnap = getSelectedActiveMiddleMend(absoluteTranslationMarkers, currentPartSelectedTranslationIds, getTranslationMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteTranslationMarkers, currentPartSelectedTranslationIds, getTranslationMarkerMendKey);
  const selectedTranslationPartMiddleSnap = selectedTranslationPart ? getSelectedActiveMiddleMend(absoluteTranslationMarkers, selectedTranslationPartSelectedTranslationIds, getTranslationMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteTranslationMarkers, selectedTranslationPartSelectedTranslationIds, getTranslationMarkerMendKey) : null;
  const selectedTranslationPartMiddleSnapActive = selectedTranslationPart ? isZoomMiddleSnapActive(absoluteTranslationMarkers, selectedTranslationPartMiddleSnap) : false;
  const selectedTranslationPartMiddleTransitionMode = getMiddleTransitionMode(absoluteTranslationMarkers, selectedTranslationPartMiddleSnap);
  const translationMiddleSnap = selectedTranslationMiddleSnap ?? getZoomMiddleSnap(absoluteTranslationMarkers, adjustedSceneTime, getTranslationMarkerMendKey);
  const inspectorTranslationMiddleSnap = selectedTranslationPartMiddleSnap ?? (selectedTranslationPart?.id === part.id ? translationMiddleSnap : null);

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
    inspectorTranslationMiddleSnap,
    inspectorZoomMiddleSnap,
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
    selectedTranslation,
    selectedTranslationPart,
    selectedTranslationPartMiddleSnapActive,
    selectedTranslationPartMiddleTransitionMode,
    selectedTranslationSnapInActive,
    selectedTranslationSnapMarkers,
    selectedTranslationSnapOutActive,
    selectedZoom,
    selectedZoomPart,
    selectedZoomPartMiddleSnapActive,
    selectedZoomPartMiddleTransitionMode,
    selectedZoomSnapInActive,
    selectedZoomSnapMarkers,
    selectedZoomSnapOutActive,
    timeline,
    translationMiddleSnap,
    validationErrors,
    zoomMiddleSnap,
    zoomScale,
  };
}

const blankPreviewComposition: CompositionClip = {
  id: "__blank_preview__",
  name: "No composition selected",
  filePath: "",
  duration: 1,
  frame: { width: FRAME_WIDTH, height: FRAME_HEIGHT, style: { background: "#050505" } },
  background: { id: "background", name: "Background", style: { background: "#050505" }, elements: [] },
  objects: [],
  snapshot: [],
  motionBlocks: [],
  zoomMarkers: [],
  translationMarkers: [],
};

type AbsoluteZoomMarker = ZoomMarker & { id: string; partId: string; start: number };
type AbsoluteTranslationMarker = TranslationMarker & { id: string; partId: string; start: number };

function timelineMarkerKey(selection: { partId: string; markerId: string }) {
  return `${selection.partId}:${selection.markerId}`;
}

function getAbsoluteTimelineMarkers(timeline: TimelinePart[], kind: "zoom"): AbsoluteZoomMarker[];
function getAbsoluteTimelineMarkers(timeline: TimelinePart[], kind: "translation"): AbsoluteTranslationMarker[];
function getAbsoluteTimelineMarkers(timeline: TimelinePart[], kind: "zoom" | "translation") {
  return timeline.flatMap((timelinePart) => (kind === "zoom" ? timelinePart.zoomMarkers : timelinePart.translationMarkers).map((marker) => ({
    ...marker,
    id: `${timelinePart.id}:${marker.id}`,
    partId: timelinePart.id,
    start: timelinePart.start + marker.start,
  })));
}
