import type { Dispatch, SetStateAction } from "react";
import type { AdjustmentLayerSelection, CompositionSelection, RightPanelTab } from "../../types";
import { syncChartObjectBounds } from "../../../core/frameInteraction";
import type { BackgroundLayer, CompositionClip, CompositionRenderMode, FrameObject, Part, PartFrame, RichTextSegment } from "../../../core/types";

type FrameObjectCommandsParams = {
  part: Part;
  selectedObjectId: string | null;
  selectedPart: Part | null;
  clearMarkerSelection: () => void;
  setEditingTextObjectId: Dispatch<SetStateAction<string | null>>;
  setRightPanelTab: Dispatch<SetStateAction<RightPanelTab>>;
  setSelectedAdjustmentLayerId: Dispatch<SetStateAction<string | null>>;
  setSelectedAdjustmentLayers: Dispatch<SetStateAction<AdjustmentLayerSelection[]>>;
  setSelectedPartId: Dispatch<SetStateAction<string>>;
  setSelectedParts: Dispatch<SetStateAction<CompositionSelection[]>>;
  setComposeSelectionObjects: (objects: FrameObject[]) => void;
  updateCompositionForTimelinePart: (partId: string, updater: (composition: CompositionClip) => CompositionClip) => void;
  updateSceneParts: (updater: (parts: Part[]) => Part[]) => void;
};

export function useFrameObjectCommands({
  part,
  selectedObjectId,
  selectedPart,
  clearMarkerSelection,
  setEditingTextObjectId,
  setRightPanelTab,
  setSelectedAdjustmentLayerId,
  setSelectedAdjustmentLayers,
  setSelectedPartId,
  setSelectedParts,
  setComposeSelectionObjects,
  updateCompositionForTimelinePart,
  updateSceneParts,
}: FrameObjectCommandsParams) {
  function updateObjectById(objectId: string, updater: (object: FrameObject) => FrameObject) {
    updateCompositionForTimelinePart(part.id, (composition) => ({
      ...composition,
      background: {
        ...composition.background,
        elements: composition.background.elements.map((object) => (object.id === objectId ? syncChartObjectBounds(updater(object)) : object)),
      },
      objects: composition.objects.map((object) => (object.id === objectId ? syncChartObjectBounds(updater(object)) : object)),
    }));
  }

  function updateSelectedObject(updater: (object: FrameObject) => FrameObject) {
    if (!selectedObjectId) return;
    updateObjectById(selectedObjectId, updater);
  }

  function updateTextObjectContent(objectId: string, content: string, richText?: RichTextSegment[]) {
    updateObjectById(objectId, (object) => (object.type === "text" ? { ...object, content, richText } : object));
  }

  function selectComposeLayerObjects(objects: FrameObject[]) {
    setRightPanelTab("video");
    setEditingTextObjectId(null);
    if (objects.length === 0) {
      setComposeSelectionObjects([]);
      return;
    }

    setSelectedPartId("");
    setSelectedParts([]);
    clearMarkerSelection();
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    setComposeSelectionObjects(objects);
  }

  function reorderComposeObjects(objectIds: string[], targetIndex: number) {
    const movingIds = new Set(objectIds);
    if (movingIds.size === 0) return;
    updateCompositionForTimelinePart(part.id, (composition) => {
      const movingObjects = composition.objects.filter((object) => movingIds.has(object.id));
      if (movingObjects.length === 0) return composition;
      const remainingObjects = composition.objects.filter((object) => !movingIds.has(object.id));
      const boundedIndex = Math.max(0, Math.min(targetIndex, remainingObjects.length));
      return {
        ...composition,
        objects: [...remainingObjects.slice(0, boundedIndex), ...movingObjects, ...remainingObjects.slice(boundedIndex)],
      };
    });
  }

  function updatePartFrame(updater: (frame: PartFrame) => PartFrame) {
    updateCompositionForTimelinePart(part.id, (composition) => ({ ...composition, frame: updater(composition.frame) }));
  }

  function updateSelectedPartDuration(duration: number) {
    if (!selectedPart) return;
    updateSceneParts((parts) => parts.map((item) => (item.id === selectedPart.id ? { ...item, duration } : item)));
  }

  function updatePartBackground(updater: (background: BackgroundLayer) => BackgroundLayer) {
    updateCompositionForTimelinePart(part.id, (composition) => ({ ...composition, background: updater(composition.background) }));
  }

  function updatePartRenderMode(renderMode: CompositionRenderMode) {
    updateCompositionForTimelinePart(part.id, (composition) => ({ ...composition, renderMode }));
  }

  return {
    reorderComposeObjects,
    selectComposeLayerObjects,
    updateObjectById,
    updatePartBackground,
    updatePartFrame,
    updatePartRenderMode,
    updateSelectedObject,
    updateSelectedPartDuration,
    updateTextObjectContent,
  };
}
