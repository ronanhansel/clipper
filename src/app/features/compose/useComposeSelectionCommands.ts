import { useCallback } from "react";
import {
  selectionObjectFromFrameObject,
  selectionPayloadFromObjects,
} from "../../../core/frameInteraction";
import type { AdjustmentEffectPointControl } from "../../../core/effects/types";
import type {
  AdjustmentLayerSelection,
  CompositionSelection,
  MotionMarkerSelection,
  RightPanelTab,
} from "../../types";
import type {
  FrameObject,
  Part,
  Point,
  SelectionPayload,
} from "../../../core/types";

type MarkerSelection = { partId: string; markerId: string } | null;
type AdjustmentPointPick = {
  layerId: string;
  control: AdjustmentEffectPointControl;
} | null;

type Setter<T> = (value: T | ((current: T) => T)) => void;

export type UseComposeSelectionCommandsParams = {
  part: Part;
  focusPickZoomMarker: MarkerSelection;
  positionPickTranslationMarker: MarkerSelection;
  trackerPickTranslationMarker: MarkerSelection;
  pointPickAdjustment: AdjustmentPointPick;
  selectedPartId: string;
  selectedParts: CompositionSelection[];
  selectedObjectId: string | null;
  selectionPayload: SelectionPayload | null;
  selectedComposeObjectIds: string[];
  selectedMotionMarker: MarkerSelection;
  selectedMotionMarkers: MotionMarkerSelection[];
  selectedAdjustmentLayerId: string | null;
  selectedAdjustmentLayers: AdjustmentLayerSelection[];
  selectedTransitionLayerId: string | null;
  selectedTransitionLayers: Array<{ layerId: string }>;
  cancelFramePickPreview: () => void;
  setComposeSelection: (selection: {
    selectedObjectId: string | null;
    selectedComposeObjectIds: string[];
    selectionPayload: SelectionPayload | null;
  }) => void;
  setSelectedComposeObjectIds: Setter<string[]>;
  setRightPanelTab: Setter<RightPanelTab>;
  setEditingTextObjectId: Setter<string | null>;
  setSelectedObjectId: Setter<string | null>;
  setSelectionPayload: Setter<SelectionPayload | null>;
  setSelectedAdjustmentLayerId: Setter<string | null>;
  setSelectedAdjustmentLayers: Setter<AdjustmentLayerSelection[]>;
  setSelectedTransitionLayerId: Setter<string | null>;
  setSelectedTransitionLayers: Setter<Array<{ layerId: string }>>;
  setSelectedPartId: Setter<string>;
  setSelectedParts: Setter<CompositionSelection[]>;
  setSelectedMotionMarker: Setter<MarkerSelection>;
  setSelectedMotionMarkers: Setter<MotionMarkerSelection[]>;
  setFocusPickZoomMarker: Setter<MarkerSelection>;
  setPositionPickTranslationMarker: Setter<MarkerSelection>;
  setTrackerPickTranslationMarker: (selection: MarkerSelection) => void;
  setPointPickAdjustment: (selection: AdjustmentPointPick) => void;
  clearStoredMarkerSelection: () => void;
  setFramePickPreviewPoint?: Setter<Point | null>;
};

export function useComposeSelectionCommands({
  part,
  focusPickZoomMarker,
  positionPickTranslationMarker,
  trackerPickTranslationMarker,
  pointPickAdjustment,
  selectedPartId,
  selectedParts,
  selectedObjectId,
  selectionPayload,
  selectedComposeObjectIds,
  selectedMotionMarker,
  selectedMotionMarkers,
  selectedAdjustmentLayerId,
  selectedAdjustmentLayers,
  selectedTransitionLayerId,
  selectedTransitionLayers,
  cancelFramePickPreview,
  setComposeSelection,
  setSelectedComposeObjectIds,
  setRightPanelTab,
  setEditingTextObjectId,
  setSelectedObjectId,
  setSelectionPayload,
  setSelectedAdjustmentLayerId,
  setSelectedAdjustmentLayers,
  setSelectedTransitionLayerId,
  setSelectedTransitionLayers,
  setSelectedPartId,
  setSelectedParts,
  setSelectedMotionMarker,
  setSelectedMotionMarkers,
  setFocusPickZoomMarker,
  setPositionPickTranslationMarker,
  setTrackerPickTranslationMarker,
  setPointPickAdjustment,
  clearStoredMarkerSelection,
}: UseComposeSelectionCommandsParams) {
  const clearMarkerSelection = useCallback(() => {
    cancelFramePickPreview();
    setTrackerPickTranslationMarker(null);
    clearStoredMarkerSelection();
  }, [
    cancelFramePickPreview,
    clearStoredMarkerSelection,
    setTrackerPickTranslationMarker,
  ]);

  const persistComposeSelection = useCallback(
    (objectIds: string[]) => {
      setSelectedComposeObjectIds(objectIds);
    },
    [setSelectedComposeObjectIds],
  );

  const setComposeSelectionObjects = useCallback(
    (objects: FrameObject[]) => {
      if (objects.length === 0) {
        setComposeSelection({
          selectedObjectId: null,
          selectedComposeObjectIds: [],
          selectionPayload: null,
        });
        return;
      }
      const objectIds = objects.map((object) => object.id);
      setComposeSelection({
        selectedObjectId: objects[0].id,
        selectedComposeObjectIds: objectIds,
        selectionPayload: selectionPayloadFromObjects(
          objects.map(selectionObjectFromFrameObject),
        ),
      });
    },
    [setComposeSelection],
  );

  const inspectComposeObject = useCallback(
    (object: FrameObject | null) => {
      setRightPanelTab("video");
      setEditingTextObjectId(null);
      setSelectedObjectId(object?.id ?? null);
      setSelectionPayload(null);
      persistComposeSelection([]);
      clearMarkerSelection();
      setSelectedAdjustmentLayerId(null);
      setSelectedAdjustmentLayers([]);
      setSelectedPartId("");
      setSelectedParts([]);
      setSelectedTransitionLayerId(null);
      setSelectedTransitionLayers([]);
    },
    [
      clearMarkerSelection,
      persistComposeSelection,
      setEditingTextObjectId,
      setRightPanelTab,
      setSelectedAdjustmentLayerId,
      setSelectedAdjustmentLayers,
      setSelectedObjectId,
      setSelectedPartId,
      setSelectedParts,
      setSelectedTransitionLayerId,
      setSelectedTransitionLayers,
      setSelectionPayload,
    ],
  );

  const selectComposeFrameSettings = useCallback(() => {
    setRightPanelTab("video");
    setEditingTextObjectId(null);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    persistComposeSelection([]);
    clearMarkerSelection();
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedPartId(part.id);
    setSelectedParts([{ partId: part.id }]);
  }, [
    clearMarkerSelection,
    part.id,
    persistComposeSelection,
    setEditingTextObjectId,
    setRightPanelTab,
    setSelectedAdjustmentLayerId,
    setSelectedAdjustmentLayers,
    setSelectedObjectId,
    setSelectedPartId,
    setSelectedParts,
    setSelectionPayload,
  ]);

  const cancelActiveSelector = useCallback(() => {
    const hasActivePicker = Boolean(
      focusPickZoomMarker ||
      positionPickTranslationMarker ||
      trackerPickTranslationMarker ||
      pointPickAdjustment,
    );
    const hasSelection = Boolean(
      selectedPartId ||
      selectedParts.length ||
      selectedObjectId ||
      selectionPayload ||
      selectedComposeObjectIds.length ||
      selectedMotionMarker ||
      selectedMotionMarkers.length ||
      selectedAdjustmentLayerId ||
      selectedAdjustmentLayers.length ||
      selectedTransitionLayerId ||
      selectedTransitionLayers.length,
    );
    if (!hasActivePicker && !hasSelection) return false;

    setFocusPickZoomMarker(null);
    setPositionPickTranslationMarker(null);
    setTrackerPickTranslationMarker(null);
    setPointPickAdjustment(null);
    cancelFramePickPreview();
    setSelectedPartId("");
    setSelectedParts([]);
    setSelectedObjectId(null);
    setSelectionPayload(null);
    persistComposeSelection([]);
    setSelectedMotionMarker(null);
    setSelectedMotionMarkers([]);
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setSelectedTransitionLayerId(null);
    setSelectedTransitionLayers([]);
    return true;
  }, [
    cancelFramePickPreview,
    focusPickZoomMarker,
    persistComposeSelection,
    pointPickAdjustment,
    positionPickTranslationMarker,
    selectedAdjustmentLayerId,
    selectedAdjustmentLayers.length,
    selectedComposeObjectIds.length,
    selectedMotionMarker,
    selectedMotionMarkers.length,
    selectedObjectId,
    selectedPartId,
    selectedParts.length,
    selectedTransitionLayerId,
    selectedTransitionLayers.length,
    selectionPayload,
    setFocusPickZoomMarker,
    setPointPickAdjustment,
    setPositionPickTranslationMarker,
    setSelectedAdjustmentLayerId,
    setSelectedAdjustmentLayers,
    setSelectedMotionMarker,
    setSelectedMotionMarkers,
    setSelectedObjectId,
    setSelectedPartId,
    setSelectedParts,
    setSelectedTransitionLayerId,
    setSelectedTransitionLayers,
    setSelectionPayload,
    setTrackerPickTranslationMarker,
    trackerPickTranslationMarker,
  ]);

  return {
    persistComposeSelection,
    setComposeSelectionObjects,
    inspectComposeObject,
    selectComposeFrameSettings,
    cancelActiveSelector,
  };
}
