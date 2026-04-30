import { useMemo } from "react";
import { createAgentContext } from "../../core/agentContext";
import { applyAdjustmentLayersToSceneTime } from "../../core/adjustments";
import { cameraTranslationToFramePoint, getCameraPreviewTransform, getLayeredCameraPreviewTransform } from "../../core/camera";
import { clamp } from "../../core/math";
import { getMotionMarkerViews, motionBlocksToMotionMarkers } from "../../core/motionEffects";
import { defaultAssets, defaultTimelineLayerState, serializeProjectForSave } from "../../core/project";
import { buildLinearTimeline, getExecutableAdjustmentLayers, getMiddleTransitionMode, getSelectedActiveMiddleMend, getSelectedZoomMiddleSnap, getTimelinePartAtTime, getTranslationMarkerMendKey, getZoomMarkerMendKey, getZoomMiddleSnap, isZoomMiddleSnapActive, sceneDuration as getSceneDuration, validateScene } from "../../core/timeline";
import { FRAME_HEIGHT, FRAME_WIDTH, type CompositionClip, type ProjectManifest, type SelectionPayload, type TimelineMode, type TimelinePart, type TranslationMarker, type ZoomMarker } from "../../core/types";
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
  const scene = project.scenes.find((item) => item.id === selectedSceneId) ?? project.scenes[0];
  if (!scene) throw new Error("Project has no timelines.");
  const assets = project.assets ?? defaultAssets;
  const timelineLayerState = project.editorState?.timelineLayers ?? defaultTimelineLayerState;
  const visibleAdjustmentLayers = getExecutableAdjustmentLayers(scene.adjustmentLayers, timelineLayerState);
  const timeline = useMemo(() => buildLinearTimeline(scene), [scene]);
  const sceneDurationSeconds = getSceneDuration({ ...scene, adjustmentLayers: visibleAdjustmentLayers });
  const adjustedSceneTime = applyAdjustmentLayersToSceneTime(currentSceneTime, visibleAdjustmentLayers);
  const compositionLookupTime = timelineMode === "compose" ? currentSceneTime : adjustedSceneTime;
  const timelinePartAtTime = getTimelinePartAtTime(timeline, compositionLookupTime);
  const activeTimelinePart = timelinePartAtTime;
  const activeComposition = activeTimelinePart ? scene.compositions.find((item) => item.id === activeTimelinePart.id) ?? null : null;
  const part = activeComposition ?? blankPreviewComposition;
  const hasActiveComposition = Boolean(activeComposition);
  const previewTime = activeTimelinePart ? clamp(compositionLookupTime - activeTimelinePart.start, 0, part.duration) : 0;
  const selectedAdjustmentLayer = scene.adjustmentLayers?.find((layer) => layer.id === selectedAdjustmentLayerId) ?? null;
  const selectedObject = part.objects.find((object) => object.id === selectedObjectId) ?? part.background.elements.find((object) => object.id === selectedObjectId) ?? null;
  const sceneMotionViews = getMotionMarkerViews(scene);
  const timelineMotionPart: CompositionClip = useMemo(() => ({
    ...blankPreviewComposition,
    id: TIMELINE_MOTION_PART_ID,
    name: "Timeline motion",
    duration: Math.max(sceneDurationSeconds, 0.1),
    motionMarkers: scene.motionMarkers ?? [],
  }), [scene.motionMarkers, sceneDurationSeconds]);
  const selectedMotionPart = selectedMotionMarker?.partId === TIMELINE_MOTION_PART_ID ? timelineMotionPart : scene.compositions.find((item) => item.id === selectedMotionMarker?.partId) ?? null;
  const selectedMotionViews = selectedMotionPart ? getMotionMarkerViews(selectedMotionPart) : null;
  const selectedZoomPart = selectedMotionViews?.zoomMarkers.some((marker) => marker.id === selectedMotionMarker?.markerId) ? selectedMotionPart : null;
  const selectedZoom = selectedZoomPart ? selectedMotionViews?.zoomMarkers.find((marker) => marker.id === selectedMotionMarker?.markerId) ?? null : null;
  const selectedTranslationPart = selectedMotionViews?.translationMarkers.some((marker) => marker.id === selectedMotionMarker?.markerId) ? selectedMotionPart : null;
  const selectedTranslation = selectedTranslationPart ? selectedMotionViews?.translationMarkers.find((marker) => marker.id === selectedMotionMarker?.markerId) ?? null : null;
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
    const shiftedMotionMarkers = motionBlocksToMotionMarkers([...sceneMotionViews.zoomMarkers, ...sceneMotionViews.translationMarkers].map((marker) => ({ ...marker, start: marker.start - partStart })));
    return {
      ...part,
      motionMarkers: shiftedMotionMarkers,
    };
  }, [activeTimelinePart?.start, part, sceneMotionViews.translationMarkers, sceneMotionViews.zoomMarkers]);
  const cameraPreviewTransform = useMemo(() => timelineMode === "composition"
    ? getLayeredCameraPreviewTransform(sceneMotionPart, motionLayers, previewTime, { hiddenLayerIds: hiddenMotionLayerIds, pickingTranslationPosition: isPickingTranslationPosition, pickingZoomFocus: isPickingZoomFocus })
    : getCameraPreviewTransform(null, null), [hiddenMotionLayerIds, isPickingTranslationPosition, isPickingZoomFocus, motionLayers, previewTime, sceneMotionPart, timelineMode]);
  const zoomScale = cameraPreviewTransform.scale;
  const absoluteZoomMarkers = useMemo(() => sceneMotionViews.zoomMarkers.map((marker) => ({ ...marker, id: timelineMarkerKey({ partId: TIMELINE_MOTION_PART_ID, markerId: marker.id }), partId: TIMELINE_MOTION_PART_ID, start: marker.start })), [sceneMotionViews.zoomMarkers]);
  const absoluteTranslationMarkers = useMemo(() => sceneMotionViews.translationMarkers.map((marker) => ({ ...marker, id: timelineMarkerKey({ partId: TIMELINE_MOTION_PART_ID, markerId: marker.id }), partId: TIMELINE_MOTION_PART_ID, start: marker.start })), [sceneMotionViews.translationMarkers]);
  const currentPartSelectedZoomIds = useMemo(() => selectedMotionMarkers.filter((selection) => selection.partId === part.id).map(timelineMarkerKey), [part.id, selectedMotionMarkers]);
  const selectedZoomPartSelectedZoomIds = useMemo(() => selectedZoomPart ? selectedMotionMarkers.filter((selection) => selection.partId === selectedZoomPart.id).map(timelineMarkerKey) : [], [selectedMotionMarkers, selectedZoomPart]);
  const selectedZoomSnapMarkers = useMemo(() => selectedMotionMarkers.flatMap((selection) => {
    const zoomPart = scene.compositions.find((item) => item.id === selection.partId);
    const zoomMarker = selection.partId === TIMELINE_MOTION_PART_ID ? sceneMotionViews.zoomMarkers.find((item) => item.id === selection.markerId) : zoomPart ? getMotionMarkerViews(zoomPart).zoomMarkers.find((item) => item.id === selection.markerId) : undefined;
    return zoomMarker ? [zoomMarker] : [];
  }), [scene.compositions, sceneMotionViews.zoomMarkers, selectedMotionMarkers]);
  const selectedZoomSnapInActive = selectedZoomSnapMarkers.length > 1 ? selectedZoomSnapMarkers.every((marker) => marker.snapIn) : Boolean(selectedZoom?.snapIn);
  const selectedZoomSnapOutActive = selectedZoomSnapMarkers.length > 1 ? selectedZoomSnapMarkers.every((marker) => marker.snapOut) : Boolean(selectedZoom?.snapOut);
  const selectedZoomMiddleSnap = getSelectedActiveMiddleMend(absoluteZoomMarkers, currentPartSelectedZoomIds, getZoomMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteZoomMarkers, currentPartSelectedZoomIds, getZoomMarkerMendKey);
  const selectedZoomPartMiddleSnap = selectedZoomPart ? getSelectedActiveMiddleMend(absoluteZoomMarkers, selectedZoomPartSelectedZoomIds, getZoomMarkerMendKey) ?? getSelectedZoomMiddleSnap(absoluteZoomMarkers, selectedZoomPartSelectedZoomIds, getZoomMarkerMendKey) : null;
  const selectedZoomPartMiddleSnapActive = selectedZoomPart ? isZoomMiddleSnapActive(absoluteZoomMarkers, selectedZoomPartMiddleSnap) : false;
  const selectedZoomPartMiddleTransitionMode = getMiddleTransitionMode(absoluteZoomMarkers, selectedZoomPartMiddleSnap);
  const zoomMiddleSnap = selectedZoomMiddleSnap ?? getZoomMiddleSnap(absoluteZoomMarkers, adjustedSceneTime, getZoomMarkerMendKey);
  const inspectorZoomMiddleSnap = selectedZoomPartMiddleSnap ?? (selectedZoomPart?.id === part.id ? zoomMiddleSnap : null);
  const currentPartSelectedTranslationIds = useMemo(() => selectedMotionMarkers.filter((selection) => selection.partId === part.id).map(timelineMarkerKey), [part.id, selectedMotionMarkers]);
  const selectedTranslationPartSelectedTranslationIds = useMemo(() => selectedTranslationPart ? selectedMotionMarkers.filter((selection) => selection.partId === selectedTranslationPart.id).map(timelineMarkerKey) : [], [selectedMotionMarkers, selectedTranslationPart]);
  const selectedTranslationSnapMarkers = useMemo(() => selectedMotionMarkers.flatMap((selection) => {
    const translationPart = scene.compositions.find((item) => item.id === selection.partId);
    const translationMarker = selection.partId === TIMELINE_MOTION_PART_ID ? sceneMotionViews.translationMarkers.find((item) => item.id === selection.markerId) : translationPart ? getMotionMarkerViews(translationPart).translationMarkers.find((item) => item.id === selection.markerId) : undefined;
    return translationMarker ? [translationMarker] : [];
  }), [scene.compositions, sceneMotionViews.translationMarkers, selectedMotionMarkers]);
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
  motionMarkers: [],
};

type AbsoluteZoomMarker = ZoomMarker & { id: string; partId: string; start: number };
type AbsoluteTranslationMarker = TranslationMarker & { id: string; partId: string; start: number };

function timelineMarkerKey(selection: { partId: string; markerId: string }) {
  return `${selection.partId}:${selection.markerId}`;
}

function getAbsoluteTimelineMarkers(timeline: TimelinePart[], kind: "zoom"): AbsoluteZoomMarker[];
function getAbsoluteTimelineMarkers(timeline: TimelinePart[], kind: "translation"): AbsoluteTranslationMarker[];
function getAbsoluteTimelineMarkers(timeline: TimelinePart[], kind: "zoom" | "translation") {
  return timeline.flatMap((timelinePart) => (kind === "zoom" ? getMotionMarkerViews(timelinePart).zoomMarkers : getMotionMarkerViews(timelinePart).translationMarkers).map((marker) => ({
    ...marker,
    id: `${timelinePart.id}:${marker.id}`,
    partId: timelinePart.id,
    start: timelinePart.start + marker.start,
  })));
}
