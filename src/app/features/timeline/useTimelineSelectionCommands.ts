import { TIMELINE_MOTION_PART_ID, type AdjustmentLayerSelection, type CompositionSelection, type RightPanelTab, type TranslationMarkerSelection, type ZoomMarkerSelection } from "../../types";
import type { Part, SelectionPayload, TimelineMode, TimelinePart } from "../../../core/types";

type MarkerSelection = { partId: string; markerId: string } | null;

type TimelineNodeSelection = {
  adjustmentLayers: AdjustmentLayerSelection[];
  compositions: CompositionSelection[];
  zoomMarkers: ZoomMarkerSelection[];
  translationMarkers: TranslationMarkerSelection[];
};

type UseTimelineSelectionCommandsInput = {
  currentSceneTimeRef: { current: number };
  rightPanelTab: RightPanelTab;
  timeline: TimelinePart[];
  cancelFramePickPreview: () => void;
  clearStoredMarkerSelection: () => void;
  clearStoredNodeSelection: () => void;
  scrubToSceneTime: (time: number) => void;
  setFocusPickZoomMarker: (selection: MarkerSelection) => void;
  setIsPlaying: (playing: boolean) => void;
  setPositionPickTranslationMarker: (selection: MarkerSelection) => void;
  setRightPanelTab: (tab: RightPanelTab) => void;
  setSelectedAdjustmentLayerId: (id: string | null) => void;
  setSelectedAdjustmentLayers: (selection: AdjustmentLayerSelection[]) => void;
  setSelectedObjectId: (id: string | null) => void;
  setSelectedPartId: (id: string) => void;
  setSelectedParts: (selection: CompositionSelection[]) => void;
  setSelectedTranslationMarker: (selection: MarkerSelection) => void;
  setSelectedTranslationMarkers: (selection: TranslationMarkerSelection[]) => void;
  setSelectedZoomMarker: (selection: MarkerSelection) => void;
  setSelectedZoomMarkers: (selection: ZoomMarkerSelection[]) => void;
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
  scrubToSceneTime,
  setFocusPickZoomMarker,
  setIsPlaying,
  setPositionPickTranslationMarker,
  setRightPanelTab,
  setSelectedAdjustmentLayerId,
  setSelectedAdjustmentLayers,
  setSelectedObjectId,
  setSelectedPartId,
  setSelectedParts,
  setSelectedTranslationMarker,
  setSelectedTranslationMarkers,
  setSelectedZoomMarker,
  setSelectedZoomMarkers,
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
    setSelectedObjectId(null);
    clearMarkerSelection();
    setSelectionPayload(null);
    setIsPlaying(false);
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

  function selectZoomMarker(partId: string, markerId: string) {
    if (partId !== TIMELINE_MOTION_PART_ID) setSelectedPartId(partId);
    setSelectedParts([]);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedZoomMarker({ partId, markerId });
    setSelectedZoomMarkers([{ partId, markerId }]);
    setSelectedParts([]);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
    setTrackerPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
  }

  function selectZoomMarkers(selection: ZoomMarkerSelection[]) {
    setSelectedParts([]);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedZoomMarkers(selection);
    const primarySelection = selection.at(-1) ?? null;
    setSelectedZoomMarker(primarySelection);
    setSelectedTranslationMarker(null);
    setSelectedTranslationMarkers([]);
    setPositionPickTranslationMarker(null);
    setTrackerPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setFocusPickZoomMarker(null);
    setIsPlaying(false);
    if (primarySelection && primarySelection.partId !== TIMELINE_MOTION_PART_ID) setSelectedPartId(primarySelection.partId);
  }

  function selectTranslationMarker(partId: string, markerId: string) {
    if (partId !== TIMELINE_MOTION_PART_ID) setSelectedPartId(partId);
    setSelectedParts([]);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedTranslationMarker({ partId, markerId });
    setSelectedTranslationMarkers([{ partId, markerId }]);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setTrackerPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
  }

  function selectTranslationMarkers(selection: TranslationMarkerSelection[]) {
    setSelectedParts([]);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedTranslationMarkers(selection);
    const primarySelection = selection.at(-1) ?? null;
    setSelectedTranslationMarker(primarySelection);
    setSelectedZoomMarker(null);
    setSelectedZoomMarkers([]);
    setFocusPickZoomMarker(null);
    setTrackerPickTranslationMarker(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setIsPlaying(false);
    if (primarySelection && primarySelection.partId !== TIMELINE_MOTION_PART_ID) setSelectedPartId(primarySelection.partId);
  }

  function selectAdjustmentLayer(layerId: string) {
    setSelectedAdjustmentLayerId(layerId);
    setSelectedAdjustmentLayers(layerId ? [{ layerId }] : []);
    setSelectedPartId("");
    setSelectedParts([]);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    clearMarkerSelection();
    if (rightPanelTab === "agent") setRightPanelTab("motion");
    setIsPlaying(false);
  }

  function selectAdjustmentLayers(selection: AdjustmentLayerSelection[]) {
    setSelectedAdjustmentLayers(selection);
    setSelectedAdjustmentLayerId(selection.at(-1)?.layerId ?? null);
    setSelectedPartId("");
    setSelectedParts([]);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    clearMarkerSelection();
    if (rightPanelTab === "agent") setRightPanelTab("motion");
    setIsPlaying(false);
  }

  function selectTimelineNodes(selection: TimelineNodeSelection) {
    const primaryZoom = selection.zoomMarkers.at(-1) ?? null;
    const primaryTranslation = selection.translationMarkers.at(-1) ?? null;
    const primaryPart = selection.compositions.at(-1) ?? null;
    setSelectedAdjustmentLayers(selection.adjustmentLayers);
    setSelectedAdjustmentLayerId(selection.adjustmentLayers.at(-1)?.layerId ?? null);
    setSelectedParts(selection.compositions);
    setSelectedZoomMarkers(selection.zoomMarkers);
    setSelectedZoomMarker(primaryZoom);
    setSelectedTranslationMarkers(selection.translationMarkers);
    setSelectedTranslationMarker(primaryTranslation);
    setSelectedPartId(primaryPart?.partId ?? "");
    setSelectedObjectId(null);
    setSelectionPayload(null);
    setFocusPickZoomMarker(null);
    setPositionPickTranslationMarker(null);
    setTrackerPickTranslationMarker(null);
    if (rightPanelTab === "agent") setRightPanelTab("motion");
    setIsPlaying(false);
  }

  return {
    clearMarkerSelection,
    clearNodeSelection,
    openComposePart,
    selectAdjustmentLayer,
    selectAdjustmentLayers,
    selectPart,
    selectTimelineNodes,
    selectTranslationMarker,
    selectTranslationMarkers,
    selectZoomMarker,
    selectZoomMarkers,
  };
}
