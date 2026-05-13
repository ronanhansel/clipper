import type { Dispatch, SetStateAction } from "react";
import type {
  AdjustmentLayerSelection,
  CompositionSelection,
  RightPanelTab,
} from "../../types";
import {
  frameObjectFromBackgroundLayer,
  syncChartObjectBounds,
} from "../../../core/frameInteraction";
import type {
  BackgroundLayer,
  CompositionClip,
  CompositionRenderMode,
  FrameObject,
  Part,
  PartFrame,
  RichTextSegment,
} from "../../../core/types";

type FrameObjectCommandsParams = {
  part: Part;
  selectedObjectId: string | null;
  selectedPart: Part | null;
  clearMarkerSelection: () => void;
  setEditingTextObjectId: Dispatch<SetStateAction<string | null>>;
  setRightPanelTab: Dispatch<SetStateAction<RightPanelTab>>;
  setSelectedAdjustmentLayerId: Dispatch<SetStateAction<string | null>>;
  setSelectedAdjustmentLayers: Dispatch<
    SetStateAction<AdjustmentLayerSelection[]>
  >;
  setSelectedPartId: Dispatch<SetStateAction<string>>;
  setSelectedParts: Dispatch<SetStateAction<CompositionSelection[]>>;
  setComposeSelectionObjects: (objects: FrameObject[]) => void;
  updateCompositionForTimelinePart: (
    partId: string,
    updater: (composition: CompositionClip) => CompositionClip,
  ) => void;
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
  function createComposeObject(type: "rect" | "ellipse" | "text") {
    const id = `${type}-${Date.now().toString(36)}`;
    const isEllipse = type === "ellipse";
    const isText = type === "text";
    const object: FrameObject = {
      id,
      name: isText ? "Text" : isEllipse ? "Ellipse" : "Rectangle",
      type: isText ? "text" : "rect",
      selector: `[data-object-id='${id}']`,
      bounds: isText
        ? { x: 220, y: 140, width: 320, height: 92 }
        : { x: 220, y: 140, width: 220, height: 140 },
      content: isText ? "Text" : undefined,
      style: isText
        ? { color: "#ffffff", fontSize: 56, fontWeight: 400, lineHeight: 1.1 }
        : {
            background: "#D5D5D5",
            ...(isEllipse ? { borderRadius: 9999 } : {}),
          },
    };
    updateCompositionForTimelinePart(part.id, (composition) => ({
      ...composition,
      objects: [...composition.objects, object],
    }));
    selectComposeLayerObjects([object]);
  }
  function updateObjectById(
    objectId: string,
    updater: (object: FrameObject) => FrameObject,
  ) {
    updateCompositionForTimelinePart(part.id, (composition) => ({
      ...composition,
      background:
        objectId === composition.background.id
          ? updateBackgroundFromFrameObject(composition.background, updater)
          : {
              ...composition.background,
              elements: composition.background.elements.map((object) =>
                object.id === objectId
                  ? syncChartObjectBounds(updater(object))
                  : object,
              ),
            },
      objects: composition.objects.map((object) =>
        object.id === objectId
          ? syncChartObjectBounds(updater(object))
          : object,
      ),
    }));
  }

  function updateBackgroundFromFrameObject(
    background: BackgroundLayer,
    updater: (object: FrameObject) => FrameObject,
  ): BackgroundLayer {
    const next = updater(frameObjectFromBackgroundLayer(background));
    return {
      ...background,
      style: next.style,
      hidden: next.hidden,
      locked: next.locked,
      animations: next.animations,
    };
  }

  function updateSelectedObject(updater: (object: FrameObject) => FrameObject) {
    if (!selectedObjectId) return;
    updateObjectById(selectedObjectId, updater);
  }

  function updateTextObjectContent(
    objectId: string,
    content: string,
    richText?: RichTextSegment[],
    bounds?: FrameObject["bounds"],
  ) {
    updateObjectById(objectId, (object) =>
      object.type === "text"
        ? { ...object, content, richText, bounds: bounds ?? object.bounds }
        : object,
    );
  }

  function selectComposeLayerObjects(objects: FrameObject[]) {
    setRightPanelTab("video");
    setEditingTextObjectId(null);
    setSelectedPartId("");
    setSelectedParts([]);
    clearMarkerSelection();
    setSelectedAdjustmentLayerId(null);
    setSelectedAdjustmentLayers([]);
    if (objects.length === 0) {
      setComposeSelectionObjects([]);
      return;
    }

    setComposeSelectionObjects(objects);
  }

  function reorderComposeObjects(objectIds: string[], targetIndex: number) {
    const movingIds = new Set(objectIds);
    if (movingIds.size === 0) return;
    updateCompositionForTimelinePart(part.id, (composition) => {
      const movingObjects = composition.objects.filter((object) =>
        movingIds.has(object.id),
      );
      if (movingObjects.length === 0) return composition;
      const remainingObjects = composition.objects.filter(
        (object) => !movingIds.has(object.id),
      );
      const boundedIndex = Math.max(
        0,
        Math.min(targetIndex, remainingObjects.length),
      );
      return {
        ...composition,
        objects: [
          ...remainingObjects.slice(0, boundedIndex),
          ...movingObjects,
          ...remainingObjects.slice(boundedIndex),
        ],
      };
    });
  }

  function updatePartFrame(updater: (frame: PartFrame) => PartFrame) {
    updateCompositionForTimelinePart(part.id, (composition) => ({
      ...composition,
      frame: updater(composition.frame),
    }));
  }

  function updateSelectedPartDuration(duration: number) {
    if (!selectedPart) return;
    updateSceneParts((parts) =>
      parts.map((item) =>
        item.id === selectedPart.id ? { ...item, duration } : item,
      ),
    );
  }

  function updatePartBackground(
    updater: (background: BackgroundLayer) => BackgroundLayer,
  ) {
    updateCompositionForTimelinePart(part.id, (composition) => ({
      ...composition,
      background: updater(composition.background),
    }));
  }

  function updatePartRenderMode(renderMode: CompositionRenderMode) {
    updateCompositionForTimelinePart(part.id, (composition) => ({
      ...composition,
      renderMode,
    }));
  }

  function deleteComposeObjects(objectIds: string[]) {
    const selectedIds = new Set(objectIds);
    if (selectedIds.size === 0) return;
    updateCompositionForTimelinePart(part.id, (composition) => {
      const objects = composition.objects.filter(
        (object) => !selectedIds.has(object.id),
      );
      return {
        ...composition,
        background: {
          ...composition.background,
          elements: composition.background.elements.filter(
            (object) => !selectedIds.has(object.id),
          ),
        },
        objects,
      };
    });
    setEditingTextObjectId(null);
    setComposeSelectionObjects([]);
  }

  return {
    reorderComposeObjects,
    selectComposeLayerObjects,
    createComposeObject,
    deleteComposeObjects,
    updateObjectById,
    updatePartBackground,
    updatePartFrame,
    updatePartRenderMode,
    updateSelectedObject,
    updateSelectedPartDuration,
    updateTextObjectContent,
  };
}
