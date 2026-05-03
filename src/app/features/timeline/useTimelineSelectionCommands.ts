import { TIMELINE_MOTION_PART_ID, type AdjustmentLayerSelection, type CompositionSelection, type MotionMarkerSelection, type RightPanelTab } from "../../types";
import type { Part, SelectionPayload, TimelineMode, TimelinePart } from "../../../core/types";

type MarkerSelection = { partId: string; markerId: string } | null;

type TimelineNodeSelection = {
  adjustmentLayers: AdjustmentLayerSelection[];
  compositions: CompositionSelection[];
  motionMarkers: MotionMarkerSelection[];
  transitionLayers: Array<{ layerId: string }>;
};

type UseTimelineSelectionCommandsInput = {
  currentSceneTimeRef: { current: number };
  rightPanelTab: RightPanelTab;
  timeline: TimelinePart[];
  cancelFramePickPreview: () => void;
  clearStoredMarkerSelection: () => void;
  clearStoredNodeSelection: () => void;
  pausePlaybackAtCurrentTime: () => void;
  scrubToSceneTime: (time: number) => void;
  setFocusPickZoomMarker: (selection: MarkerSelection) => void;
  setPositionPickTranslationMarker: (selection: MarkerSelection) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  setSelectedAdjustmentLayerId: (id: string | null) => void;
  setSelectedAdjustmentLayers: (selection: AdjustmentLayerSelection[]) => void;
  setSelectedObjectId: (id: string | null) => void;
  setSelectedPartId: (id: string) => void;
  setSelectedParts: (selection: CompositionSelection[]) => void;
  setSelectedMotionMarker: (selection: MarkerSelection) => void;
  setSelectedMotionMarkers: (selection: MotionMarkerSelection[]) => void;
  setSelectedTransitionLayerId: (id: string | null) => void;
  setSelectedTransitionLayers: (selection: Array<{ layerId: string }>) => void;
  setSelectionPayload: (payload: SelectionPayload | null) => void;
  setTrackerPickTranslationMarker: (selection: MarkerSelection) => void;
  updateTimelineMode: (mode: TimelineMode) => void;
};

export function useTimelineSelectionCommands({
  currentSceneTimeRef,
  rightPanelTab,
  timeline,
  cancelFramePickPreview,
  clearStoredMarkerSelection,
  clearStoredNodeSelection,
  pausePlaybackAtCurrentTime,
  scrubToSceneTime,
  setFocusPickZoomMarker,
  setPositionPickTranslationMarker,
  setRightPanelTab,
  setSelectedAdjustmentLayerId,
  setSelectedAdjustmentLayers,
  setSelectedObjectId,
  setSelectedPartId,
  setSelectedParts,
  setSelectedMotionMarker,
  setSelectedMotionMarkers,
  setSelectedTransitionLayerId,
  setSelectedTransitionLayers,
  setSelectionPayload,
  setTrackerPickTranslationMarker,
  updateTimelineMode,
}: UseTimelineSelectionCommandsInput) {
  function clearMarkerSelection() {
    cancelFramePickPreview();
    setTrackerPickTranslationMarker(null);
    clearStoredMarkerSelection();
  }

  function clearNodeSelection() {
    cancelFramePickPreview();
    setTrackerPickTranslationMarker(null);
    clearStoredNodeSelection();
  }

  function selectPart(partId: string) {
    setSelectedPartId(partId);
    setSelectedParts(partId ? [{ partId }] : []);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedTransitionLayerId(null);
    setSelectedTransitionLayers([]);
    setSelectedObjectId(null);
    clearMarkerSelection();
    setSelectionPayload(null);
    pausePlaybackAtCurrentTime();
  }

  function openComposePart(partId: string) {
    const timelinePart = timeline.find((item) => item.id === partId);
    if (!timelinePart) return;
    const currentTime = currentSceneTimeRef.current;
    const insidePart = currentTime >= timelinePart.start && currentTime < timelinePart.start + timelinePart.duration;
    selectPart(partId);
    if (!insidePart) scrubToSceneTime(timelinePart.start);
    updateTimelineMode("compose");
  }

  function selectMotionMarker(partId: string, markerId: string) {
    if (partId !== TIMELINE_MOTION_PART_ID) setSelectedPartId(partId);
    setSelectedParts([]);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedTransitionLayerId(null);
    setSelectedTransitionLayers([]);
    setSelectedMotionMarker({ partId, markerId });
    setSelectedMotionMarkers([{ partId, markerId }]);
    setSelectedParts([]);
    setPositionPickTranslationMarker(null);
    setTrackerPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    pausePlaybackAtCurrentTime();
  }

  function selectMotionMarkers(selection: MotionMarkerSelection[]) {
    setSelectedParts([]);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedTransitionLayerId(null);
    setSelectedTransitionLayers([]);
    setSelectedMotionMarkers(selection);
    const primarySelection = selection.at(-1) ?? null;
    setSelectedMotionMarker(primarySelection);
    setPositionPickTranslationMarker(null);
    setTrackerPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setFocusPickZoomMarker(null);
    pausePlaybackAtCurrentTime();
    if (primarySelection && primarySelection.partId !== TIMELINE_MOTION_PART_ID) setSelectedPartId(primarySelection.partId);
  }

  function selectAdjustmentLayer(layerId: string) {
    setSelectedAdjustmentLayerId(layerId);
    setSelectedAdjustmentLayers(layerId ? [{ layerId }] : []);
    setSelectedPartId("");
    setSelectedParts([]);
    setSelectedTransitionLayerId(null);
    setSelectedTransitionLayers([]);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    clearMarkerSelection();
    if (rightPanelTab === "agent") setRightPanelTab("motion");
    pausePlaybackAtCurrentTime();
  }

  function selectAdjustmentLayers(selection: AdjustmentLayerSelection[]) {
    setSelectedAdjustmentLayers(selection);
    setSelectedAdjustmentLayerId(selection.at(-1)?.layerId ?? null);
    setSelectedPartId("");
    setSelectedParts([]);
    setSelectedTransitionLayerId(null);
    setSelectedTransitionLayers([]);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    clearMarkerSelection();
    if (rightPanelTab === "agent") setRightPanelTab("motion");
    pausePlaybackAtCurrentTime();
  }

  function selectTimelineNodes(selection: TimelineNodeSelection) {
    const primaryMotion = selection.motionMarkers.at(-1) ?? null;
    const primaryPart = selection.compositions.at(-1) ?? null;
    setSelectedAdjustmentLayers(selection.adjustmentLayers);
    setSelectedAdjustmentLayerId(selection.adjustmentLayers.at(-1)?.layerId ?? null);
    setSelectedParts(selection.compositions);
    setSelectedMotionMarkers(selection.motionMarkers);
    setSelectedMotionMarker(primaryMotion);
    setSelectedPartId(primaryPart?.partId ?? "");
    setSelectedTransitionLayers(selection.transitionLayers);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setFocusPickZoomMarker(null);
    setPositionPickTranslationMarker(null);
    setTrackerPickTranslationMarker(null);
    if (rightPanelTab === "agent") setRightPanelTab("motion");
    pausePlaybackAtCurrentTime();
  }

  return {
    clearMarkerSelection,
    clearNodeSelection,
    openComposePart,
    selectAdjustmentLayer,
    selectAdjustmentLayers,
    selectPart,
    selectTimelineNodes,
    selectMotionMarker,
    selectMotionMarkers,
  };
}
