import { useMemo } from "react";
import { createAgentContext } from "../../core/agentContext";
import { applyAdjustmentLayersToSceneTime } from "../../core/adjustments";
import { cameraTranslationToFramePoint, getCameraPreviewTransform, getLayeredCameraPreviewTransform } from "../../core/camera";
import { clamp } from "../../core/math";
import { defaultAssets, defaultTimelineLayerState } from "../../core/project";
import { buildLinearTimeline, getAdjustmentLayerRowId, getMiddleTransitionMode, getSelectedActiveMiddleMend, getSelectedZoomMiddleSnap, getTimelinePartAtTime, getTranslationMarkerMendKey, getZoomMarkerMendKey, getZoomMiddleSnap, isZoomMiddleSnapActive, validateScene } from "../../core/timeline";
import { FRAME_HEIGHT, FRAME_WIDTH, type CompositionClip, type ProjectManifest, type Scene, type SelectionPayload, type TimelineMode } from "../../core/types";
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
  const scene = project.scenes.find((item) => item.id === selectedSceneId) ?? project.scenes[0] ?? emptyScene;
  const assets = project.assets ?? defaultAssets;
  const timeline = useMemo(() => buildLinearTimeline(scene), [scene]);
  const sceneDurationSeconds = timeline.at(-1)?.end ?? 0;
  const hiddenAdjustmentLayerIds = new Set((project.editorState?.timelineLayers?.adjustmentLayers ?? defaultTimelineLayerState.adjustmentLayers!).filter((layer) => layer.hidden).map((layer) => layer.id));
  const visibleAdjustmentLayers = scene.adjustmentLayers?.filter((layer) => !hiddenAdjustmentLayerIds.has(getAdjustmentLayerRowId(layer)));
  const adjustedSceneTime = applyAdjustmentLayersToSceneTime(currentSceneTime, visibleAdjustmentLayers);
  const activeTimelinePart = getTimelinePartAtTime(timeline, adjustedSceneTime) ?? timeline.find((item) => item.id === selectedPartId) ?? timeline[0];
  const part = scene.compositions.find((item) => item.id === activeTimelinePart?.id) ?? scene.compositions[0] ?? emptyComposition;
  const previewTime = clamp(adjustedSceneTime - (activeTimelinePart?.start ?? 0), 0, part.duration);
  const selectedAdjustmentLayer = scene.adjustmentLayers?.find((layer) => layer.id === selectedAdjustmentLayerId) ?? null;
  const selectedObject = part.objects.find((object) => object.id === selectedObjectId) ?? null;
  const selectedZoomPart = scene.compositions.find((item) => item.id === selectedZoomMarker?.partId) ?? null;
  const selectedZoom = selectedZoomPart?.zoomMarkers.find((marker) => marker.id === selectedZoomMarker?.markerId) ?? null;
  const selectedTranslationPart = scene.compositions.find((item) => item.id === selectedTranslationMarker?.partId) ?? null;
  const selectedTranslation = selectedTranslationPart?.translationMarkers.find((marker) => marker.id === selectedTranslationMarker?.markerId) ?? null;
  const selectedPart = scene.compositions.find((item) => item.id === selectedPartId) ?? null;
  const validationErrors = useMemo(() => validateScene(scene), [scene]);
  const motionLayers = project.editorState?.timelineLayers?.motionLayers?.length ? project.editorState.timelineLayers.motionLayers : defaultTimelineLayerState.motionLayers!;
  const hiddenMotionLayerIds = useMemo(() => new Set(motionLayers.filter((layer) => layer.hidden).map((layer) => layer.id)), [motionLayers]);
  const agentContext = useMemo(() => createAgentContext(project, scene, part, selectionPayload), [project, scene, part, selectionPayload]);
  const projectSnapshot = useMemo(() => getProjectContentSnapshot(project), [project]);
  const editorStateSnapshot = useMemo(() => JSON.stringify(project.editorState), [project.editorState]);
  const compositionSourcesSnapshot = useMemo(() => JSON.stringify(compositionSources), [compositionSources]);
  const hasUnsavedProjectChanges = projectSnapshot !== savedProjectSnapshot;
  const hasUnsavedSourceChanges = compositionSourcesSnapshot !== savedCompositionSourcesSnapshot;
  const hasUnsavedChanges = hasUnsavedProjectChanges || hasUnsavedSourceChanges;
  const isPickingZoomFocus = Boolean(focusPickZoomMarker);
  const isPickingTranslationPosition = Boolean(positionPickTranslationMarker);
  const canSelectFrameObjects = timelineMode === "edit";
  const persistedFramePickPoint = isPickingZoomFocus && selectedZoom ? selectedZoom.focus : isPickingTranslationPosition && selectedTranslation ? cameraTranslationToFramePoint(selectedTranslation.position) : null;
  const framePickPoint = framePickPreviewPoint ?? persistedFramePickPoint;
  const sceneMotionPart = useMemo(() => {
    const partStart = activeTimelinePart?.start ?? 0;
    return {
      ...part,
      zoomMarkers: timeline.flatMap((timelinePart) => timelinePart.zoomMarkers.map((marker) => ({ ...marker, start: timelinePart.start + marker.start - partStart }))),
      translationMarkers: timeline.flatMap((timelinePart) => timelinePart.translationMarkers.map((marker) => ({ ...marker, start: timelinePart.start + marker.start - partStart }))),
    };
  }, [activeTimelinePart?.start, part, timeline]);
  const cameraPreviewTransform = useMemo(() => timelineMode === "composition"
    ? getLayeredCameraPreviewTransform(sceneMotionPart, motionLayers, previewTime, { hiddenLayerIds: hiddenMotionLayerIds, pickingTranslationPosition: isPickingTranslationPosition, pickingZoomFocus: isPickingZoomFocus })
    : getCameraPreviewTransform(null, null), [hiddenMotionLayerIds, isPickingTranslationPosition, isPickingZoomFocus, motionLayers, previewTime, sceneMotionPart, timelineMode]);
  const zoomScale = cameraPreviewTransform.scale;
  const currentPartSelectedZoomIds = useMemo(() => selectedZoomMarkers.filter((selection) => selection.partId === part.id).map((selection) => selection.markerId), [part.id, selectedZoomMarkers]);
  const selectedZoomPartSelectedZoomIds = useMemo(() => selectedZoomPart ? selectedZoomMarkers.filter((selection) => selection.partId === selectedZoomPart.id).map((selection) => selection.markerId) : [], [selectedZoomMarkers, selectedZoomPart]);
  const selectedZoomSnapMarkers = useMemo(() => selectedZoomMarkers.flatMap((selection) => {
    const zoomPart = scene.compositions.find((item) => item.id === selection.partId);
    const zoomMarker = zoomPart?.zoomMarkers.find((item) => item.id === selection.markerId);
    return zoomMarker ? [zoomMarker] : [];
  }), [scene.compositions, selectedZoomMarkers]);
  const selectedZoomSnapInActive = selectedZoomSnapMarkers.length > 1 ? selectedZoomSnapMarkers.every((marker) => marker.snapIn) : Boolean(selectedZoom?.snapIn);
  const selectedZoomSnapOutActive = selectedZoomSnapMarkers.length > 1 ? selectedZoomSnapMarkers.every((marker) => marker.snapOut) : Boolean(selectedZoom?.snapOut);
  const selectedZoomMiddleSnap = getSelectedActiveMiddleMend(part.zoomMarkers, currentPartSelectedZoomIds, getZoomMarkerMendKey) ?? getSelectedZoomMiddleSnap(part.zoomMarkers, currentPartSelectedZoomIds, getZoomMarkerMendKey);
  const selectedZoomPartMiddleSnap = selectedZoomPart ? getSelectedActiveMiddleMend(selectedZoomPart.zoomMarkers, selectedZoomPartSelectedZoomIds, getZoomMarkerMendKey) ?? getSelectedZoomMiddleSnap(selectedZoomPart.zoomMarkers, selectedZoomPartSelectedZoomIds, getZoomMarkerMendKey) : null;
  const selectedZoomPartMiddleSnapActive = selectedZoomPart ? isZoomMiddleSnapActive(selectedZoomPart.zoomMarkers, selectedZoomPartMiddleSnap) : false;
  const selectedZoomPartMiddleTransitionMode = getMiddleTransitionMode(selectedZoomPart?.zoomMarkers ?? [], selectedZoomPartMiddleSnap);
  const zoomMiddleSnap = selectedZoomMiddleSnap ?? getZoomMiddleSnap(part.zoomMarkers, previewTime, getZoomMarkerMendKey);
  const inspectorZoomMiddleSnap = selectedZoomPartMiddleSnap ?? (selectedZoomPart?.id === part.id ? zoomMiddleSnap : null);
  const currentPartSelectedTranslationIds = useMemo(() => selectedTranslationMarkers.filter((selection) => selection.partId === part.id).map((selection) => selection.markerId), [part.id, selectedTranslationMarkers]);
  const selectedTranslationPartSelectedTranslationIds = useMemo(() => selectedTranslationPart ? selectedTranslationMarkers.filter((selection) => selection.partId === selectedTranslationPart.id).map((selection) => selection.markerId) : [], [selectedTranslationMarkers, selectedTranslationPart]);
  const selectedTranslationSnapMarkers = useMemo(() => selectedTranslationMarkers.flatMap((selection) => {
    const translationPart = scene.compositions.find((item) => item.id === selection.partId);
    const translationMarker = translationPart?.translationMarkers.find((item) => item.id === selection.markerId);
    return translationMarker ? [translationMarker] : [];
  }), [scene.compositions, selectedTranslationMarkers]);
  const selectedTranslationSnapInActive = selectedTranslationSnapMarkers.length > 1 ? selectedTranslationSnapMarkers.every((marker) => marker.snapIn) : Boolean(selectedTranslation?.snapIn);
  const selectedTranslationSnapOutActive = selectedTranslationSnapMarkers.length > 1 ? selectedTranslationSnapMarkers.every((marker) => marker.snapOut) : Boolean(selectedTranslation?.snapOut);
  const selectedTranslationMiddleSnap = getSelectedActiveMiddleMend(part.translationMarkers, currentPartSelectedTranslationIds, getTranslationMarkerMendKey) ?? getSelectedZoomMiddleSnap(part.translationMarkers, currentPartSelectedTranslationIds, getTranslationMarkerMendKey);
  const selectedTranslationPartMiddleSnap = selectedTranslationPart ? getSelectedActiveMiddleMend(selectedTranslationPart.translationMarkers, selectedTranslationPartSelectedTranslationIds, getTranslationMarkerMendKey) ?? getSelectedZoomMiddleSnap(selectedTranslationPart.translationMarkers, selectedTranslationPartSelectedTranslationIds, getTranslationMarkerMendKey) : null;
  const selectedTranslationPartMiddleSnapActive = selectedTranslationPart ? isZoomMiddleSnapActive(selectedTranslationPart.translationMarkers, selectedTranslationPartMiddleSnap) : false;
  const selectedTranslationPartMiddleTransitionMode = getMiddleTransitionMode(selectedTranslationPart?.translationMarkers ?? [], selectedTranslationPartMiddleSnap);
  const translationMiddleSnap = selectedTranslationMiddleSnap ?? getZoomMiddleSnap(part.translationMarkers, previewTime, getTranslationMarkerMendKey);
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

const emptyComposition: CompositionClip = {
  id: "empty_composition",
  name: "Empty Composition",
  filePath: "compositions/empty_composition.ts",
  duration: 1,
  frame: { width: FRAME_WIDTH, height: FRAME_HEIGHT, style: { background: "#050505" } },
  background: { id: "background", name: "Background", style: { background: "#050505" }, elements: [] },
  objects: [],
  snapshot: [],
  zoomMarkers: [],
  translationMarkers: [],
};

const emptyScene: Scene = {
  id: "empty_timeline",
  name: "Empty Timeline",
  compositions: [emptyComposition],
  adjustmentLayers: [],
};
