import { useMemo } from "react";
import { createAgentContext } from "../../core/agentContext";
import { applyAdjustmentLayersToSceneTime } from "../../core/adjustments";
import { cameraTranslationToFramePoint, getActiveTranslation, getActiveZoom, getCameraPreviewTransform } from "../../core/camera";
import { clamp } from "../../core/math";
import { defaultAssets } from "../../core/project";
import { buildLinearTimeline, getMiddleTransitionMode, getSelectedActiveMiddleMend, getSelectedZoomMiddleSnap, getTimelinePartAtTime, getZoomMiddleSnap, isZoomMiddleSnapActive, validateScene } from "../../core/timeline";
import type { ProjectManifest, SelectionPayload, TimelineMode } from "../../core/types";
import type { TranslationMarkerSelection, ZoomMarkerSelection } from "../types";
import { getProjectContentSnapshot } from "./projectStore";

export function useEditorDerivedState({
  currentSceneTime,
  focusPickZoomMarker,
  framePickPreviewPoint,
  liveZoomScalePreview,
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
  liveZoomScalePreview: { partId: string; markerId: string; scale: number } | null;
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
  const assets = project.assets ?? defaultAssets;
  const timeline = useMemo(() => buildLinearTimeline(scene), [scene]);
  const sceneDurationSeconds = timeline.at(-1)?.end ?? 0;
  const adjustedSceneTime = applyAdjustmentLayersToSceneTime(currentSceneTime, scene.adjustmentLayers);
  const activeTimelinePart = getTimelinePartAtTime(timeline, adjustedSceneTime) ?? timeline.find((item) => item.id === selectedPartId) ?? timeline[0];
  const part = scene.compositions.find((item) => item.id === activeTimelinePart?.id) ?? scene.compositions[0];
  const previewTime = clamp(adjustedSceneTime - (activeTimelinePart?.start ?? 0), 0, part.duration);
  const selectedAdjustmentLayer = scene.adjustmentLayers?.find((layer) => layer.id === selectedAdjustmentLayerId) ?? null;
  const selectedObject = part.objects.find((object) => object.id === selectedObjectId) ?? null;
  const selectedZoomPart = scene.compositions.find((item) => item.id === selectedZoomMarker?.partId) ?? null;
  const selectedZoom = selectedZoomPart?.zoomMarkers.find((marker) => marker.id === selectedZoomMarker?.markerId) ?? null;
  const selectedTranslationPart = scene.compositions.find((item) => item.id === selectedTranslationMarker?.partId) ?? null;
  const selectedTranslation = selectedTranslationPart?.translationMarkers.find((marker) => marker.id === selectedTranslationMarker?.markerId) ?? null;
  const selectedPart = scene.compositions.find((item) => item.id === selectedPartId) ?? null;
  const validationErrors = useMemo(() => validateScene(scene), [scene]);
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
  const previewZoomMarkers = useMemo(() => {
    if (liveZoomScalePreview?.partId !== part.id) return part.zoomMarkers;
    return part.zoomMarkers.map((marker) => (marker.id === liveZoomScalePreview.markerId ? { ...marker, scale: liveZoomScalePreview.scale } : marker));
  }, [liveZoomScalePreview, part.id, part.zoomMarkers]);
  const persistedFramePickPoint = isPickingZoomFocus && selectedZoom ? selectedZoom.focus : isPickingTranslationPosition && selectedTranslation ? cameraTranslationToFramePoint(selectedTranslation.position) : null;
  const framePickPoint = framePickPreviewPoint ?? persistedFramePickPoint;
  const cameraPreviewTransform = useMemo(() => getCameraPreviewTransform(timelineMode === "composition" && !isPickingZoomFocus ? getActiveZoom(previewZoomMarkers, previewTime) : null, timelineMode === "composition" && !isPickingTranslationPosition ? getActiveTranslation(part.translationMarkers, previewTime, part) : null), [isPickingTranslationPosition, isPickingZoomFocus, part, part.translationMarkers, previewTime, previewZoomMarkers, timelineMode]);
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
  const selectedZoomMiddleSnap = getSelectedActiveMiddleMend(part.zoomMarkers, currentPartSelectedZoomIds) ?? getSelectedZoomMiddleSnap(part.zoomMarkers, currentPartSelectedZoomIds);
  const selectedZoomPartMiddleSnap = selectedZoomPart ? getSelectedActiveMiddleMend(selectedZoomPart.zoomMarkers, selectedZoomPartSelectedZoomIds) ?? getSelectedZoomMiddleSnap(selectedZoomPart.zoomMarkers, selectedZoomPartSelectedZoomIds) : null;
  const selectedZoomPartMiddleSnapActive = selectedZoomPart ? isZoomMiddleSnapActive(selectedZoomPart.zoomMarkers, selectedZoomPartMiddleSnap) : false;
  const selectedZoomPartMiddleTransitionMode = getMiddleTransitionMode(selectedZoomPart?.zoomMarkers ?? [], selectedZoomPartMiddleSnap);
  const zoomMiddleSnap = selectedZoomMiddleSnap ?? getZoomMiddleSnap(part.zoomMarkers, previewTime);
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
  const selectedTranslationMiddleSnap = getSelectedActiveMiddleMend(part.translationMarkers, currentPartSelectedTranslationIds) ?? getSelectedZoomMiddleSnap(part.translationMarkers, currentPartSelectedTranslationIds);
  const selectedTranslationPartMiddleSnap = selectedTranslationPart ? getSelectedActiveMiddleMend(selectedTranslationPart.translationMarkers, selectedTranslationPartSelectedTranslationIds) ?? getSelectedZoomMiddleSnap(selectedTranslationPart.translationMarkers, selectedTranslationPartSelectedTranslationIds) : null;
  const selectedTranslationPartMiddleSnapActive = selectedTranslationPart ? isZoomMiddleSnapActive(selectedTranslationPart.translationMarkers, selectedTranslationPartMiddleSnap) : false;
  const selectedTranslationPartMiddleTransitionMode = getMiddleTransitionMode(selectedTranslationPart?.translationMarkers ?? [], selectedTranslationPartMiddleSnap);
  const translationMiddleSnap = selectedTranslationMiddleSnap ?? getZoomMiddleSnap(part.translationMarkers, previewTime);
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
    previewZoomMarkers,
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
    validationErrors,
    zoomMiddleSnap,
    zoomScale,
  };
}
