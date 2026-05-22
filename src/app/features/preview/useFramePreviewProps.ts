import { useMemo, type RefObject } from "react";
import type {
  AdjustmentLayer,
  Bounds,
  CameraObjectProps,
  Part,
  Point,
  SelectionPayload,
  TimelineMode,
  TimelineMotionLayerState,
  TransitionLayer,
} from "../../../core/types";
import type { SceneWrapConfig } from "../../state/framePreviewRenderModel";
import type { CameraPreviewTransform } from "../../../core/camera";
import type { ObjectSnapGuide } from "../../../core/frameInteraction";
import type {
  ComposeDrawTool,
  ShapeDrawPreview,
} from "../compose/composeDrawing";
import type { TimelinePreviewStackPart } from "../../../core/timeline";
import type { StrategyFramePreviewProps } from "../../../components/preview/strategies/preview";
import type { PreviewFps } from "../../../core/previewFps";

type AdjustmentPointPick = unknown;
type MarkerSelection = { partId: string; markerId: string } | null;

type ComposeDrawingFns = {
  wrappedOnFramePointerCancel: StrategyFramePreviewProps["onFramePointerCancel"];
  wrappedOnFramePointerDown: StrategyFramePreviewProps["onFramePointerDown"];
  wrappedOnFramePointerMove: StrategyFramePreviewProps["onFramePointerMove"];
  wrappedOnFramePointerLeave: StrategyFramePreviewProps["onFramePointerLeave"];
  wrappedOnFramePointerUp: StrategyFramePreviewProps["onFramePointerUp"];
  handlePathControlPointerDown: StrategyFramePreviewProps["onPathControlPointerDown"];
  handleObjectCornerRadiusChange: StrategyFramePreviewProps["onObjectCornerRadiusChange"];
  handleTextEditEnd: StrategyFramePreviewProps["onTextEditEnd"];
  updateTextPathOffset: StrategyFramePreviewProps["onTextPathOffsetChange"];
};

export type UseFramePreviewPropsParams = {
  cameraRef: RefObject<HTMLDivElement | null>;
  dragSelectionBoxRef: RefObject<HTMLDivElement | null>;
  frameViewportRef: RefObject<HTMLDivElement | null>;
  hasPreviewComposition: boolean;
  composeMode: boolean;
  dragBox: Bounds | null;
  activeFramePickPoint: Point | null;
  isPickingZoomFocus: boolean;
  isPickingTranslationPosition: boolean;
  pointPickAdjustment: AdjustmentPointPick;
  trackerPickTranslationMarker: MarkerSelection;
  canSelectFrameObjects: boolean;
  isPlaying: boolean;
  cameraPreviewTransform: CameraPreviewTransform;
  displayFramePreviewScale: number;
  previewFps: PreviewFps;
  part: Part;
  sceneMotionPart: Part;
  sceneWrap: SceneWrapConfig;
  displayPartStart: number;
  previewParts: TimelinePreviewStackPart[];
  transitionPreviewParts: StrategyFramePreviewProps["transitionPreviewParts"];
  visibleSceneAdjustmentLayers: AdjustmentLayer[];
  visibleSceneTransitionLayers: TransitionLayer[];
  motionLayers: TimelineMotionLayerState[];
  hiddenMotionLayerIds: Set<string>;
  activeCompositionHidden: boolean;
  previewTime: number;
  adjustedSceneTime: number;
  timelineMode: TimelineMode;
  previewSceneContext: StrategyFramePreviewProps["previewSceneContext"];
  previewSelectionObjects: SelectionPayload["objects"];
  objectSnapGuides: ObjectSnapGuide[];
  marqueeDragging: boolean;
  editingTextObjectId: string | null;
  activeTool: ComposeDrawTool | null;
  shapeDrawPreview: ShapeDrawPreview | null;
  composeDrawing: ComposeDrawingFns;
  onFramePointerDownCapture: StrategyFramePreviewProps["onFramePointerDownCapture"];
  startObjectDrag: StrategyFramePreviewProps["onObjectPointerDown"];
  startObjectResize: StrategyFramePreviewProps["onObjectResizePointerDown"];
  startTextObjectEdit: StrategyFramePreviewProps["onTextObjectDoubleClick"];
  openComposeObjectContextMenu: NonNullable<
    StrategyFramePreviewProps["onObjectContextMenu"]
  >;
  updateTextObjectContent: StrategyFramePreviewProps["onTextEditCommit"];
  commitTranslationTrackerPick: StrategyFramePreviewProps["onTrackerTargetPick"];
  selectedObjectId: string | null;
  onCameraPropsChange: (
    cameraObjectId: string,
    next: CameraObjectProps,
  ) => void;
  onCameraPathEaseChange?: (
    cameraObjectId: string,
    trackPath: string,
    pointIndex: number,
    side: "in" | "out",
    nextCpX: number,
  ) => void;
  onSelectObject?: (objectId: string | null) => void;
  authorViewState?: StrategyFramePreviewProps["authorViewState"];
  onAuthorViewStateChange?: StrategyFramePreviewProps["onAuthorViewStateChange"];
  onObjectTransformChange?: (
    objectId: string,
    transform: {
      bounds?: { x: number; y: number };
      translateZ?: number;
      rotateX?: number;
      rotateY?: number;
      rotateZ?: number;
    },
  ) => void;
};

export function useFramePreviewProps({
  cameraRef,
  dragSelectionBoxRef,
  frameViewportRef,
  hasPreviewComposition,
  composeMode,
  dragBox,
  activeFramePickPoint,
  isPickingZoomFocus,
  isPickingTranslationPosition,
  pointPickAdjustment,
  trackerPickTranslationMarker,
  canSelectFrameObjects,
  isPlaying,
  cameraPreviewTransform,
  displayFramePreviewScale,
  previewFps,
  part,
  sceneMotionPart,
  sceneWrap,
  displayPartStart,
  previewParts,
  transitionPreviewParts,
  visibleSceneAdjustmentLayers,
  visibleSceneTransitionLayers,
  motionLayers,
  hiddenMotionLayerIds,
  activeCompositionHidden,
  previewTime,
  adjustedSceneTime,
  timelineMode,
  previewSceneContext,
  previewSelectionObjects,
  objectSnapGuides,
  marqueeDragging,
  editingTextObjectId,
  activeTool,
  shapeDrawPreview,
  composeDrawing,
  onFramePointerDownCapture,
  startObjectDrag,
  startObjectResize,
  startTextObjectEdit,
  openComposeObjectContextMenu,
  updateTextObjectContent,
  commitTranslationTrackerPick,
  selectedObjectId,
  onCameraPropsChange,
  onCameraPathEaseChange,
  onSelectObject,
  authorViewState,
  onAuthorViewStateChange,
  onObjectTransformChange,
}: UseFramePreviewPropsParams): StrategyFramePreviewProps {
  return useMemo((): StrategyFramePreviewProps => {
    return {
      cameraRef,
      dragBox: hasPreviewComposition && composeMode ? dragBox : null,
      dragSelectionBoxRef,
      framePickPoint:
        hasPreviewComposition && composeMode ? activeFramePickPoint : null,
      focusPicking:
        hasPreviewComposition &&
        (isPickingZoomFocus ||
          isPickingTranslationPosition ||
          Boolean(pointPickAdjustment)),
      trackerPicking:
        hasPreviewComposition && Boolean(trackerPickTranslationMarker),
      canSelectObjects:
        hasPreviewComposition && canSelectFrameObjects && !isPlaying,
      cameraTransform: cameraPreviewTransform,
      frameViewportRef,
      frameScale: displayFramePreviewScale,
      previewFps,
      isPlaying,
      part,
      sceneMotionPart,
      sceneWrap,
      partStart: displayPartStart,
      previewParts,
      transitionPreviewParts,
      adjustmentLayers: visibleSceneAdjustmentLayers,
      transitionLayers: visibleSceneTransitionLayers,
      motionLayers,
      hiddenMotionLayerIds,
      compHidden: activeCompositionHidden,
      previewTime,
      sceneTime: adjustedSceneTime,
      timelineMode,
      pickingTranslationPosition:
        hasPreviewComposition &&
        (isPickingTranslationPosition || Boolean(pointPickAdjustment)),
      pickingZoomFocus:
        hasPreviewComposition &&
        (isPickingZoomFocus || Boolean(pointPickAdjustment)),
      previewSceneContext,
      activeCompositionHidden,
      selectedObjects:
        hasPreviewComposition && composeMode ? previewSelectionObjects : [],
      objectSnapGuides:
        hasPreviewComposition && composeMode ? objectSnapGuides : [],
      marqueeDragging: hasPreviewComposition && composeMode && marqueeDragging,
      editingTextObjectId:
        hasPreviewComposition && composeMode && !isPlaying
          ? editingTextObjectId
          : null,
      activeShapeTool: composeMode ? activeTool : null,
      shapeDrawPreview: composeMode ? shapeDrawPreview : null,
      onFramePointerCancel: composeDrawing.wrappedOnFramePointerCancel,
      onFramePointerDown: composeDrawing.wrappedOnFramePointerDown,
      onFramePointerDownCapture,
      onFramePointerMove: composeDrawing.wrappedOnFramePointerMove,
      onFramePointerLeave: composeDrawing.wrappedOnFramePointerLeave,
      onFramePointerUp: composeDrawing.wrappedOnFramePointerUp,
      onObjectPointerDown: startObjectDrag,
      onObjectContextMenu: openComposeObjectContextMenu,
      onObjectResizePointerDown: startObjectResize,
      onPathControlPointerDown: composeDrawing.handlePathControlPointerDown,
      onObjectCornerRadiusChange: composeDrawing.handleObjectCornerRadiusChange,
      onTextEditCommit: updateTextObjectContent,
      onTextEditEnd: composeDrawing.handleTextEditEnd,
      onTextPathOffsetChange: composeDrawing.updateTextPathOffset,
      onTextObjectDoubleClick: startTextObjectEdit,
      onTrackerTargetPick: commitTranslationTrackerPick,
      selectedObjectId: composeMode ? selectedObjectId : null,
      onCameraPropsChange,
      onCameraPathEaseChange,
      onSelectObject,
      authorViewState,
      onAuthorViewStateChange,
      onObjectTransformChange,
    };
  }, [
    cameraRef,
    hasPreviewComposition,
    dragBox,
    dragSelectionBoxRef,
    activeFramePickPoint,
    isPickingZoomFocus,
    isPickingTranslationPosition,
    pointPickAdjustment,
    trackerPickTranslationMarker,
    canSelectFrameObjects,
    isPlaying,
    cameraPreviewTransform,
    frameViewportRef,
    displayFramePreviewScale,
    previewFps,
    part,
    sceneMotionPart,
    sceneWrap,
    composeMode,
    displayPartStart,
    previewParts,
    transitionPreviewParts,
    visibleSceneAdjustmentLayers,
    visibleSceneTransitionLayers,
    previewTime,
    adjustedSceneTime,
    timelineMode,
    motionLayers,
    hiddenMotionLayerIds,
    activeCompositionHidden,
    previewSceneContext,
    previewSelectionObjects,
    objectSnapGuides,
    marqueeDragging,
    editingTextObjectId,
    activeTool,
    shapeDrawPreview,
    composeDrawing.wrappedOnFramePointerCancel,
    composeDrawing.wrappedOnFramePointerDown,
    onFramePointerDownCapture,
    composeDrawing.wrappedOnFramePointerMove,
    composeDrawing.wrappedOnFramePointerLeave,
    composeDrawing.wrappedOnFramePointerUp,
    startObjectDrag,
    openComposeObjectContextMenu,
    startObjectResize,
    composeDrawing.handlePathControlPointerDown,
    composeDrawing.handleObjectCornerRadiusChange,
    updateTextObjectContent,
    composeDrawing.handleTextEditEnd,
    composeDrawing.updateTextPathOffset,
    startTextObjectEdit,
    commitTranslationTrackerPick,
    selectedObjectId,
    onCameraPropsChange,
    onCameraPathEaseChange,
    onSelectObject,
    authorViewState,
    onAuthorViewStateChange,
    onObjectTransformChange,
  ]);
}
