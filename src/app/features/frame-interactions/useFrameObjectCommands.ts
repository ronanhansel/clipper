import type { Dispatch, SetStateAction } from "react";
import type { RightPanelTab } from "../../types";
import {
  getSvgDrawContent,
  type ComposeDrawTool,
} from "../compose/composeDrawing";
import {
  frameObjectFromBackgroundLayer,
  selectionObjectFromFrameObject,
  selectionPayloadFromObjects,
  syncChartObjectBounds,
} from "../../../core/frameInteraction";
import { getPattern2dDefaults } from "../../../core/graphics/pattern2d";
import type {
  BackgroundLayer,
  CompositionClip,
  CompositionRenderMode,
  FrameObject,
  LightObjectKind,
  Part,
  PartFrame,
  RichTextSegment,
} from "../../../core/types";
import {
  DEFAULT_CAMERA_OBJECT_PROPS,
  DEFAULT_LIGHT_OBJECT_PROPS,
  FRAME_HEIGHT,
  FRAME_WIDTH,
} from "../../../core/types";

type FrameObjectCommandsParams = {
  part: Part;
  selectedObjectId: string | null;
  selectedPart: Part | null;
  setEditingTextObjectId: Dispatch<SetStateAction<string | null>>;
  setComposeSelectionObjects: (objects: FrameObject[]) => void;
  applyComposeLayerSelection: (selection: {
    selectedObjectId: string | null;
    selectedComposeObjectIds: string[];
    selectionPayload: import("../../../core/types").SelectionPayload | null;
    rightPanelTab: RightPanelTab;
  }) => void;
  updateCompositionForTimelinePart: (
    partId: string,
    updater: (composition: CompositionClip) => CompositionClip,
    options?: {
      history?: boolean;
      syncSources?: boolean;
      coalesceHistory?: boolean;
      historyGroup?: string;
    },
  ) => void;
  updateSceneParts: (updater: (parts: Part[]) => Part[]) => void;
};

export function useFrameObjectCommands({
  part,
  selectedObjectId,
  selectedPart,
  setEditingTextObjectId,
  setComposeSelectionObjects,
  applyComposeLayerSelection,
  updateCompositionForTimelinePart,
  updateSceneParts,
}: FrameObjectCommandsParams) {
  function createComposeObject(
    type: Exclude<ComposeDrawTool, "null"> | "media",
  ) {
    const id = `${type}-${Date.now().toString(36)}`;
    const isEllipse = type === "ellipse";
    const isText = type === "text";
    const isMedia = type === "media";
    const isPattern2d = type === "pattern2d";
    const isCode = type === "code";
    const isSvg = isFixedSvgDrawTool(type);
    const isPolygon = type === "polygon";
    const isStar = type === "star";
    const bounds = getFixedObjectBounds(type);
    const object: FrameObject = {
      id,
      name: isText
        ? "Text"
        : isEllipse
          ? "Ellipse"
          : isMedia
            ? "Media"
            : isPattern2d
              ? "Pattern"
              : isCode
                ? "Code"
                : getFixedShapeName(type),
      type: isText
        ? "text"
        : isMedia
          ? "media"
          : isPattern2d
            ? "pattern2d"
            : isCode
              ? "code"
              : isSvg
                ? "svg"
                : "rect",
      selector: `[data-object-id='${id}']`,
      bounds,
      content: isText
        ? "Text"
        : isSvg
          ? getSvgDrawContent(
              type,
              { x: bounds.x, y: bounds.y + bounds.height / 2 },
              { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
              undefined,
              undefined,
              bounds,
            )
          : undefined,
      style: isText
        ? { color: "#ffffff", fontSize: 72, fontWeight: 400, lineHeight: 1.1 }
        : isMedia
          ? {
              backgroundColor: "transparent",
              objectFit: "cover",
              overflow: "hidden",
            }
          : isPattern2d
            ? { backgroundColor: "transparent", overflow: "hidden" }
            : isCode
              ? { backgroundColor: "transparent", overflow: "hidden" }
              : isSvg
                ? { backgroundColor: "transparent", overflow: "visible" }
                : {
                    backgroundColor: "#D5D5D5",
                    ...(isEllipse ? { borderRadius: 9999 } : {}),
                    ...(isPolygon
                      ? {
                          clipPath:
                            "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)",
                        }
                      : {}),
                    ...(isStar
                      ? {
                          clipPath:
                            "polygon(50% 0%, 61% 35%, 98% 35%, 68% 56%, 79% 91%, 50% 70%, 21% 91%, 32% 56%, 2% 35%, 39% 35%)",
                        }
                      : {}),
                  },
      props: isPattern2d
        ? {
            preset: "polkaDots",
            seed: 1,
            ...getPattern2dDefaults("polkaDots"),
          }
        : isCode
          ? { source: null }
          : undefined,
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
    options?: {
      history?: boolean;
      syncSources?: boolean;
      coalesceHistory?: boolean;
      historyGroup?: string;
    },
  ) {
    updateCompositionForTimelinePart(
      part.id,
      (composition) => ({
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
      }),
      options,
    );
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
        : isTextPathObject(object)
          ? {
              ...object,
              content: replaceTextPathContent(object.content ?? "", content),
            }
          : object,
    );
  }

  function selectComposeLayerObjects(objects: FrameObject[]) {
    if (objects.length === 0) {
      applyComposeLayerSelection({
        selectedObjectId: null,
        selectedComposeObjectIds: [],
        selectionPayload: null,
        rightPanelTab: "video",
      });
      return;
    }

    const selectionObjects = objects.map((object) =>
      selectionObjectFromFrameObject(object),
    );
    applyComposeLayerSelection({
      selectedObjectId: objects[0].id,
      selectedComposeObjectIds: objects.map((object) => object.id),
      selectionPayload: selectionPayloadFromObjects(selectionObjects),
      rightPanelTab: "video",
    });
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

  function createCameraObject() {
    const id = `camera-${Date.now().toString(36)}`;
    const cameraIndex =
      part.objects.filter((o) => o.type === "camera").length + 1;
    const object: FrameObject = {
      id,
      name: `Camera ${cameraIndex}`,
      type: "camera",
      selector: `[data-object-id='${id}']`,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      style: {},
      props: {
        live: DEFAULT_CAMERA_OBJECT_PROPS.live,
        position: { ...DEFAULT_CAMERA_OBJECT_PROPS.position },
        rotation: { ...DEFAULT_CAMERA_OBJECT_PROPS.rotation },
        fov: DEFAULT_CAMERA_OBJECT_PROPS.fov,
        near: DEFAULT_CAMERA_OBJECT_PROPS.near,
        far: DEFAULT_CAMERA_OBJECT_PROPS.far,
      },
    };
    updateCompositionForTimelinePart(part.id, (composition) => ({
      ...composition,
      objects: [...composition.objects, object],
    }));
    return object.id;
  }

  function createLightObject(kind: LightObjectKind = "directional") {
    const id = `light-${Date.now().toString(36)}`;
    const lightIndex =
      part.objects.filter((object) => object.type === "light").length + 1;
    const object: FrameObject = {
      id,
      name: `${lightName(kind)} ${lightIndex}`,
      type: "light",
      selector: `[data-object-id='${id}']`,
      bounds: { x: FRAME_WIDTH / 2, y: FRAME_HEIGHT / 2, width: 0, height: 0 },
      style: {},
      threeD: true,
      transform: { translateZ: kind === "ambient" ? 0 : 600 },
      props: {
        ...DEFAULT_LIGHT_OBJECT_PROPS,
        kind,
        castShadow:
          kind === "directional" || kind === "spot" || kind === "point",
        intensity: kind === "ambient" ? 0.35 : 1,
      },
    };
    updateCompositionForTimelinePart(part.id, (composition) => ({
      ...composition,
      objects: [...composition.objects, object],
    }));
    selectComposeLayerObjects([object]);
    return object.id;
  }

  function deleteComposeObjects(objectIds: string[]) {
    const selectedIds = new Set(objectIds);
    if (selectedIds.size === 0) return;
    updateCompositionForTimelinePart(part.id, (composition) => {
      const objects = composition.objects
        .filter((object) => !selectedIds.has(object.id))
        .map((object) => {
          if (object.parentId && selectedIds.has(object.parentId)) {
            const { parentId: _, ...rest } = object;
            return rest;
          }
          return object;
        });
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
    createCameraObject,
    createLightObject,
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

function getFixedObjectBounds(
  type: Exclude<ComposeDrawTool, "null"> | "media",
) {
  if (type === "text") return { x: 220, y: 140, width: 320, height: 92 };
  if (type === "media" || type === "pattern2d" || type === "code") {
    return { x: 200, y: 120, width: 480, height: 320 };
  }
  if (isFixedSvgDrawTool(type))
    return { x: 220, y: 200, width: 320, height: 10 };
  return { x: 220, y: 140, width: 220, height: 140 };
}

function isFixedSvgDrawTool(
  type: Exclude<ComposeDrawTool, "null"> | "media",
): type is "line" | "arrow" | "pen" | "pencil" | "textPath" {
  return (
    type === "line" ||
    type === "arrow" ||
    type === "pen" ||
    type === "pencil" ||
    type === "textPath"
  );
}

function getFixedShapeName(type: Exclude<ComposeDrawTool, "null"> | "media") {
  if (type === "line") return "Line";
  if (type === "arrow") return "Arrow";
  if (type === "polygon") return "Polygon";
  if (type === "star") return "Star";
  if (type === "pen") return "Path";
  if (type === "pencil") return "Pencil";
  if (type === "textPath") return "Text on path";
  return "Rectangle";
}

function lightName(kind: LightObjectKind) {
  if (kind === "ambient") return "Ambient Light";
  if (kind === "point") return "Point Light";
  if (kind === "spot") return "Spot Light";
  return "Directional Light";
}

function isTextPathObject(object: FrameObject) {
  const raw = object.style.clipperPath;
  if (typeof raw !== "string") return false;
  try {
    return (JSON.parse(raw) as { tool?: string }).tool === "textPath";
  } catch {
    return false;
  }
}

function replaceTextPathContent(svg: string, content: string) {
  const escaped = escapeXmlText(content || "Text on path");
  return svg.replace(
    /(<textPath\b[^>]*>)([\s\S]*?)(<\/textPath>)/,
    `$1${escaped}$3`,
  );
}

function escapeXmlText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
