import {
  Component as ReactComponent,
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { PictureInPicture2, SquareSplitHorizontal } from "lucide-react";
import {
  selectorBlue,
  selectorHandleSizePx,
  selectorOffsetPx,
  videoExportFrameRate,
} from "../../app/config";
import { defaultPreviewFps, type PreviewFps } from "../../core/previewFps";
import {
  getRenderableTextSegments,
  getSelectionFormatState,
  normalizeEditableFormatting,
  renderRichTextSegments,
  richTextSegmentsFromElement,
  shouldPersistRichText,
  textSegmentsToEditableNodes,
} from "../../app/richText";
import { evaluateLayerAnimation } from "../../core/animations";
import { applyAdjustmentLayersToVisualStyle } from "../../core/adjustments";
import {
  boundsToViewport,
  formatCameraPreviewFilter,
  formatCameraPreviewTransform,
  getLayeredCameraPreviewTransform,
  type CameraPreviewTransform,
} from "../../core/camera";
import {
  insetBounds,
  isVisibleMarqueeBounds,
  updateDragSelectionBoxElement,
  type ObjectSnapGuide,
  type ResizeHandle,
} from "../../core/frameInteraction";
import { clamp } from "../../core/math";
import { MEDIA_PLACEHOLDER_DATA_URL } from "../../core/mediaPlaceholder";
import { normalizeClipperMediaUrl } from "../../core/mediaSource";
import { getMediaAssetType } from "../../core/mediaTypes";
import { getMediaVideoTime } from "../../core/mediaVideoPlayback";
import { hasVisibleShadow } from "../../core/effects/shadowVisibility";
import {
  getWebCodecsVideoFrameProvider,
  type WebCodecsVideoFrameProvider,
} from "../../core/webCodecsVideoFrameProvider";
import {
  getFramePortalOverlayTransform,
  viewportBoundsToPortal,
  viewportPointToPortal,
  type FramePortalOverlayTransform,
} from "../../core/overlayGeometry";
import {
  readOverlayTransform,
  startPortalSyncLoop,
  syncTargetRectToPortalElement,
  syncViewportBoundsToPortalElement,
} from "../../core/portalOverlaySync";
import { transformPathGeometrySegmentsToBounds } from "../../core/pathGeometry";
import type { TimelinePreviewStackPart } from "../../core/timeline";
import type { SceneWrapConfig } from "../../app/state/framePreviewRenderModel";
import {
  getRenderClockAttributes,
  getRenderClockStyle,
  syncDomAnimationsToRenderClock,
  waitForRenderClockAnimationsReady,
} from "../../render-engine/renderClock";
import {
  buildFrameObjectParentTransformLookup,
  evaluateBackgroundLayer,
  evaluateFrameObject,
  isTimeSensitiveFrameObject,
  type EvaluatedFrameObject,
} from "../../render-engine/renderRuntime";
import {
  applyTransitionLayersToVisualStyle,
  getTransitionFinishTime,
  getTransitionProgress,
  renderTransitionSequence,
  transitionEndpointEpsilonSeconds,
} from "../../core/transitions";
import {
  FRAME_HEIGHT,
  FRAME_WIDTH,
  type AdjustmentLayer,
  type BackgroundLayer,
  type Bounds,
  type CameraObjectProps,
  type FrameObject,
  type Part,
  type Point,
  type RichTextSegment,
  type SelectionPayload,
  type TimelineMode,
  type TimelineMotionLayerState,
  type TransitionLayer,
} from "../../core/types";
import { buildPattern2dSvg } from "../../core/graphics/pattern2d";
import { CodeObjectFrame } from "./CodeObjectFrame";
import type {
  AdjustmentVisualOverlay,
  TransitionSequenceStyle,
  TransitionVisualOverlay,
} from "../../core/effects/types";
import { useAdjustedSceneTime } from "../../app/features/playback/playbackTimeStore";
import {
  rasterizeSvgForExport,
  shouldPreRasterizeSvgForExport,
  type SvgRasterResult,
} from "./exportSvgRasterCache";
import { StrokeOverlay } from "./StrokeOverlay";
import { SceneCompositor } from "./compositors/SceneCompositor";
import { DomBackend } from "./backends/DomBackend";
import { RasterBackend } from "./backends/RasterBackend";
import { PreviewRenderProvider } from "./previewRenderStore";
import type {
  CameraPreviewMode,
  ComposeAuthorViewState,
} from "./three/ComposeAuthorView";

const noop = () => {};

const identityCameraTransform: CameraPreviewTransform = {
  x: 0,
  y: 0,
  z: 0,
  scale: 1,
  rotation: 0,
  rotateX: 0,
  rotateY: 0,
  perspective: 1800,
  motionBlur: 0,
};

type ExportTileViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type ExportTileFrameBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type FramePreviewProps = {
  cameraRef: RefObject<HTMLDivElement | null>;
  dragBox: Bounds | null;
  dragSelectionBoxRef: RefObject<HTMLDivElement | null>;
  framePickPoint: Point | null;
  focusPicking: boolean;
  trackerPicking: boolean;
  canSelectObjects: boolean;
  cameraTransform: CameraPreviewTransform;
  frameViewportRef: RefObject<HTMLDivElement | null>;
  frameScale: number;
  previewFps?: PreviewFps;
  isPlaying: boolean;
  part: Part;
  compositionLibrary?: Part[];
  /**
   * Composition that carries scene-level motion markers rebased into the
   * active part's local time. Used only by the camera transform — never
   * mounted as a renderable. Distinct from `part` so the composition's own
   * motion markers are not clobbered.
   */
  sceneMotionPart: Part;
  sceneWrap: SceneWrapConfig;
  partStart: number;
  adjustmentLayers?: AdjustmentLayer[];
  previewTime: number;
  sceneTime: number;
  timelineMode: TimelineMode;
  motionLayers: TimelineMotionLayerState[];
  hiddenMotionLayerIds?: Set<string>;
  pickingTranslationPosition: boolean;
  pickingZoomFocus: boolean;
  compHidden?: boolean;
  selectedObjects: SelectionPayload["objects"];
  objectSnapGuides?: ObjectSnapGuide[];
  marqueeDragging: boolean;
  editingTextObjectId: string | null;
  onFramePointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
  onFramePointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onFramePointerDownCapture: (event: PointerEvent<HTMLDivElement>) => void;
  onFramePointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onFramePointerLeave: (event: PointerEvent<HTMLDivElement>) => void;
  onFramePointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  activeShapeTool?: ComposeDrawTool | null;
  handToolActive?: boolean;
  shapeDrawPreview?: ShapeDrawPreview | null;
  onObjectPointerDown: (
    event: PointerEvent<HTMLDivElement>,
    object: FrameObject,
  ) => void;
  onObjectContextMenu?: (
    event: ReactMouseEvent<HTMLDivElement>,
    object: FrameObject,
  ) => void;
  onObjectResizePointerDown: (
    event: PointerEvent<HTMLDivElement>,
    handle: ResizeHandle,
    objectId?: string,
  ) => void;
  onPathControlPointerDown?: (
    event: PointerEvent<HTMLButtonElement>,
    objectId: string,
    segmentIndex: number,
    control: "start" | "end" | "c1" | "c2",
  ) => void;
  onObjectCornerRadiusChange?: (objectId: string, radius: number) => void;
  onTextEditCommit: (
    objectId: string,
    content: string,
    richText?: RichTextSegment[],
  ) => void;
  onTextEditEnd?: () => void;
  onTextPathOffsetChange?: (
    objectId: string,
    offset: number,
    options?: { history?: boolean },
  ) => void;
  onTextObjectDoubleClick: (
    event: ReactMouseEvent<HTMLDivElement>,
    object: FrameObject,
  ) => void;
  onSubcompositionDoubleClick?: (
    compositionId: string,
    sourceObjectId?: string | null,
  ) => void;
  onTrackerTargetPick: (objectId: string) => void;
  exportTileViewport?: ExportTileViewport;
  selectionOverlayScale?: number;
  previewParts: TimelinePreviewStackPart[];
  prewarmParts?: TimelinePreviewStackPart[];
  transitionPreviewParts?: {
    from: TimelinePreviewStackPart[];
    to: TimelinePreviewStackPart[];
    fromSceneTime: number;
    toSceneTime: number;
  } | null;
  transitionLayers?: TransitionLayer[];
  renderMode?: "preview" | "export";
  previewOverlayHost?: HTMLElement | null;
  selectedObjectId?: string | null;
  isPostProcessSource?: boolean;
  cameraPreviewOverride?: CameraObjectProps | null;
  onCameraPropsChange?: (
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
  authorViewState?: ComposeAuthorViewState;
  onAuthorViewStateChange?: (state: Partial<ComposeAuthorViewState>) => void;
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
  onAuthorPreviewContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

export type ComposeDrawTool =
  | "rect"
  | "line"
  | "arrow"
  | "ellipse"
  | "polygon"
  | "star"
  | "pen"
  | "pencil"
  | "text"
  | "textPath"
  | "pattern2d"
  | "null"
  | "code";

export function isPenDrawTool(tool: ComposeDrawTool | null | undefined) {
  return tool === "pen" || tool === "pencil" || tool === "textPath";
}

type ShapeDrawPreview = {
  bounds: Bounds;
  start: Point;
  end: Point;
  points?: Point[];
  path?: string;
  joints?: Point[];
  handles?: Array<{ anchor: Point; handle: Point }>;
};

export const FramePreview = memo(function FramePreview({
  cameraRef,
  dragBox,
  dragSelectionBoxRef,
  framePickPoint,
  focusPicking,
  trackerPicking,
  canSelectObjects,
  cameraTransform,
  frameViewportRef,
  frameScale,
  previewFps = defaultPreviewFps,
  isPlaying,
  part,
  compositionLibrary = [],
  sceneMotionPart,
  sceneWrap,
  partStart,
  adjustmentLayers,
  previewTime,
  sceneTime,
  timelineMode,
  motionLayers,
  hiddenMotionLayerIds,
  pickingTranslationPosition,
  pickingZoomFocus,
  compHidden,
  selectedObjects,
  marqueeDragging,
  editingTextObjectId,
  onFramePointerCancel,
  onFramePointerDown,
  onFramePointerDownCapture,
  onFramePointerMove,
  onFramePointerLeave,
  onFramePointerUp,
  onObjectPointerDown,
  onObjectContextMenu,
  onObjectResizePointerDown,
  onPathControlPointerDown,
  onObjectCornerRadiusChange,
  onTextEditCommit,
  onTextEditEnd,
  onTextPathOffsetChange,
  onTextObjectDoubleClick,
  onSubcompositionDoubleClick,
  onTrackerTargetPick,
  activeShapeTool,
  handToolActive = false,
  shapeDrawPreview,
  selectedObjectId,
  isPostProcessSource,
  onCameraPropsChange,
  onCameraPathEaseChange,
  onSelectObject,
  authorViewState,
  onAuthorViewStateChange,
  onObjectTransformChange,
  onAuthorPreviewContextMenu,
}: FramePreviewProps) {
  const exportTileViewport = (
    arguments[0] as { exportTileViewport?: ExportTileViewport }
  ).exportTileViewport;
  const exportTileFrameBounds = useMemo(
    () =>
      exportTileViewport
        ? {
            x: exportTileViewport.x / frameScale,
            y: exportTileViewport.y / frameScale,
            width: exportTileViewport.width / frameScale,
            height: exportTileViewport.height / frameScale,
          }
        : undefined,
    [exportTileViewport, frameScale],
  );
  const viewportStyle = useMemo(
    () =>
      ({
        width: exportTileViewport?.width ?? FRAME_WIDTH * frameScale,
        height: exportTileViewport?.height ?? FRAME_HEIGHT * frameScale,
      }) as CSSProperties,
    [exportTileViewport?.height, exportTileViewport?.width, frameScale],
  );
  const selectionOverlayScale = Math.max(
    (arguments[0] as { selectionOverlayScale?: number })
      .selectionOverlayScale ?? 1,
    0.001,
  );
  const selectionOffsetPx = selectorOffsetPx / selectionOverlayScale;
  const selectionHandleSizePx = selectorHandleSizePx / selectionOverlayScale;
  const animationsEnabled = true;
  const previewParts = (
    arguments[0] as {
      previewParts: Array<{ part: Part; start: number; previewTime: number }>;
    }
  ).previewParts;
  const transitionPreviewParts = (
    arguments[0] as {
      transitionPreviewParts?: {
        from: Array<{ part: Part; start: number; previewTime: number }>;
        to: Array<{ part: Part; start: number; previewTime: number }>;
        fromSceneTime: number;
        toSceneTime: number;
      } | null;
    }
  ).transitionPreviewParts;
  const prewarmParts = (
    arguments[0] as { prewarmParts?: TimelinePreviewStackPart[] }
  ).prewarmParts;
  const transitionLayers = (
    arguments[0] as { transitionLayers?: TransitionLayer[] }
  ).transitionLayers;
  const renderMode =
    (arguments[0] as { renderMode?: "preview" | "export" }).renderMode ??
    "preview";
  const previewOverlayHost = (
    arguments[0] as { previewOverlayHost?: HTMLElement | null }
  ).previewOverlayHost;
  const objectSnapGuides =
    (arguments[0] as { objectSnapGuides?: ObjectSnapGuide[] })
      .objectSnapGuides ?? [];
  const composePlaybackActive =
    sceneWrap.interactionsLockedDuringPlayback && isPlaying;
  const composeAuthorViewActive =
    !sceneWrap.flattenComposition &&
    Boolean(onCameraPropsChange) &&
    part.objects.some((obj) => obj.type === "camera" && !obj.hidden);
  const [composeAuthorPreviewMode, setComposeAuthorPreviewMode] =
    useState<CameraPreviewMode>(authorViewState?.previewMode ?? "pip");
  useEffect(() => {
    if (!authorViewState) return;
    setComposeAuthorPreviewMode(authorViewState.previewMode);
  }, [authorViewState]);
  const composeAuthor3dActive =
    composeAuthorViewActive && composeAuthorPreviewMode !== "2d";
  const composeAuthor2dActive =
    composeAuthorViewActive && composeAuthorPreviewMode === "2d";
  const displayPart = useMemo(
    () => ({
      ...part,
      objects: part.objects.filter(
        (object) =>
          object.type !== "light" &&
          (!composeAuthor2dActive || object.type !== "camera"),
      ),
    }),
    [composeAuthor2dActive, part],
  );
  const displaySceneMotionPart = useMemo(
    () => ({
      ...sceneMotionPart,
      objects: sceneMotionPart.objects.filter(
        (object) =>
          object.type !== "light" &&
          (!composeAuthor2dActive || object.type !== "camera"),
      ),
    }),
    [composeAuthor2dActive, sceneMotionPart],
  );
  const effectiveAuthorViewState = useMemo(
    () =>
      authorViewState
        ? { ...authorViewState, previewMode: composeAuthorPreviewMode }
        : undefined,
    [authorViewState, composeAuthorPreviewMode],
  );
  const interactiveDragBox = composePlaybackActive ? null : dragBox;
  const interactiveFramePickPoint = composePlaybackActive
    ? null
    : framePickPoint;
  const interactiveFocusPicking = composePlaybackActive ? false : focusPicking;
  const interactiveTrackerPicking = composePlaybackActive
    ? false
    : trackerPicking;
  const interactiveSelectedObjects = composePlaybackActive
    ? []
    : composeAuthor2dActive
      ? selectedObjects.filter((object) => object.type !== "camera")
      : selectedObjects;
  const interactiveObjectSnapGuides = composePlaybackActive
    ? []
    : objectSnapGuides;
  const interactiveEditingTextObjectId = composePlaybackActive
    ? null
    : editingTextObjectId;
  const displaySceneTime = sceneTime;
  const displayPreviewTime = previewTime;
  const visualAdjustment = useMemo(
    () =>
      applyAdjustmentLayersToVisualStyle(displaySceneTime, adjustmentLayers),
    [adjustmentLayers, displaySceneTime],
  );
  const visualTransition = useMemo(
    () =>
      applyTransitionLayersToVisualStyle(displaySceneTime, transitionLayers),
    [displaySceneTime, transitionLayers],
  );
  const activeTransitionLayer = getActiveTransitionLayer(
    displaySceneTime,
    transitionLayers,
  );
  const transitionProgress = activeTransitionLayer
    ? getTransitionProgress(displaySceneTime, activeTransitionLayer)
    : null;
  const transitionSequenceStyle = useMemo(
    () =>
      activeTransitionLayer
        ? renderTransitionSequence(
            displaySceneTime,
            activeTransitionLayer,
            30,
            {
              width: FRAME_WIDTH,
              height: FRAME_HEIGHT,
            },
          )
        : undefined,
    [activeTransitionLayer, displaySceneTime],
  );
  const useTransitionComposite = Boolean(
    transitionPreviewParts && activeTransitionLayer,
  );
  const visualAdjustmentStyle = useMemo(
    () =>
      ({
        filter:
          [
            useTransitionComposite ? undefined : visualAdjustment.filter,
            visualTransition.filter,
          ]
            .filter(Boolean)
            .join(" ") || undefined,
        ...visualTransition.frameStyle,
      }) as CSSProperties,
    [
      useTransitionComposite,
      visualAdjustment.filter,
      visualTransition.filter,
      visualTransition.frameStyle,
    ],
  );
  const transitionCameraStyle = useMemo(
    () =>
      (useTransitionComposite ? undefined : visualTransition.cameraStyle) as
        | CSSProperties
        | undefined,
    [useTransitionComposite, visualTransition.cameraStyle],
  );
  const frameVisualAdjustmentOverlaysRef = useRef<HTMLDivElement | null>(null);
  const cameraVisualAdjustmentOverlaysRef = useRef<HTMLDivElement | null>(null);
  const activeCameraTransform = useMemo(() => {
    if (!sceneWrap.cameraEnabled || composeAuthor2dActive)
      return cameraTransform;
    return getLayeredCameraPreviewTransform(
      displaySceneMotionPart,
      motionLayers,
      displayPreviewTime,
      {
        hiddenLayerIds: hiddenMotionLayerIds,
        pickingTranslationPosition: composePlaybackActive
          ? false
          : pickingTranslationPosition,
        pickingZoomFocus: composePlaybackActive ? false : pickingZoomFocus,
        resetMotionEffects:
          interactiveTrackerPicking ||
          interactiveFocusPicking ||
          (!composePlaybackActive && pickingTranslationPosition) ||
          (!composePlaybackActive && pickingZoomFocus),
      },
    );
  }, [
    cameraTransform,
    composePlaybackActive,
    displayPreviewTime,
    hiddenMotionLayerIds,
    interactiveFocusPicking,
    interactiveTrackerPicking,
    motionLayers,
    displaySceneMotionPart,
    composeAuthor2dActive,
    sceneWrap.cameraEnabled,
    pickingTranslationPosition,
    pickingZoomFocus,
  ]);
  const liveCameraTransform = useTransitionComposite
    ? identityCameraTransform
    : activeCameraTransform;
  const frameBackground = displayPart.frame.style.backgroundColor ?? "#000";
  const frameStyle = useMemo(() => {
    const base = {
      width: FRAME_WIDTH,
      height: FRAME_HEIGHT,
      background: frameBackground,
      left: exportTileViewport ? -exportTileViewport.x : 0,
      top: exportTileViewport ? -exportTileViewport.y : 0,
      transform: frameScale === 1 ? undefined : `scale(${frameScale})`,
    } as CSSProperties;
    if (composeAuthor3dActive) {
      return {
        ...base,
        width: "100%",
        height: "100%",
        transform: undefined,
      } as CSSProperties;
    }
    return base;
  }, [composeAuthor3dActive, exportTileViewport, frameBackground, frameScale]);
  const perspectiveStageStyle = useMemo(
    () =>
      ({
        perspective: `${liveCameraTransform.perspective}px`,
        perspectiveOrigin: "center",
        transformStyle: "preserve-3d",
      }) as CSSProperties,
    [liveCameraTransform.perspective],
  );
  const selectableObjects = useMemo(
    () => [...displayPart.background.elements, ...displayPart.objects],
    [displayPart.background.elements, displayPart.objects],
  );
  const evaluatedSelectableObjectsById = useMemo(
    () =>
      new Map(
        selectableObjects.map((object) => [
          object.id,
          evaluateFrameObject(
            object,
            displayPreviewTime,
            displayPart.duration,
            {
              animations: true,
            },
          ),
        ]),
      ),
    [displayPart.duration, displayPreviewTime, selectableObjects],
  );
  const selectedPreviewObjects = interactiveSelectedObjects;
  const viewportOverlayStyle = useMemo(
    () =>
      composeAuthor3dActive
        ? ({
            width: "100%",
            height: "100%",
          } as CSSProperties)
        : exportTileViewport
          ? ({
              width: exportTileViewport.width,
              height: exportTileViewport.height,
            } as CSSProperties)
          : ({
              width: FRAME_WIDTH * frameScale,
              height: FRAME_HEIGHT * frameScale,
            } as CSSProperties),
    [composeAuthor3dActive, exportTileViewport, frameScale],
  );
  const clippedViewportStyle = useMemo(
    () =>
      ({
        ...viewportStyle,
        left: 0,
        top: 0,
        ...(composeAuthor3dActive ? { width: "100%", height: "100%" } : null),
      }) as CSSProperties,
    [viewportStyle, composeAuthor3dActive],
  );
  const [trackerHoverTarget, setTrackerHoverTarget] = useState<{
    id: string;
    viewportBounds: Bounds;
  } | null>(null);
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);
  const hoveredObjectIdRef = useRef<string | null>(null);
  const showDragBox =
    interactiveDragBox &&
    isVisibleMarqueeBounds(interactiveDragBox, frameScale);
  const showShapeDrawPreview = Boolean(
    shapeDrawPreview &&
    activeShapeTool &&
    (shapeDrawPreview.bounds.width > 0 ||
      shapeDrawPreview.bounds.height > 0 ||
      (shapeDrawPreview.joints?.length ?? 0) > 0 ||
      (shapeDrawPreview.handles?.length ?? 0) > 0),
  );
  const isUnlinkedPart = Boolean(displayPart.sourceMissing);
  const compositionError = displayPart.compositionError;
  const livePlaybackPartRef = useRef(displayPart);
  livePlaybackPartRef.current = displayPart;
  const stackPreviewParts = useMemo(
    () =>
      composeAuthor2dActive
        ? previewParts.map((item) =>
            item.part.id === part.id ? { ...item, part: displayPart } : item,
          )
        : previewParts,
    [composeAuthor2dActive, displayPart, part.id, previewParts],
  );

  useLayoutEffect(() => {
    const adjustmentOverlays = useTransitionComposite
      ? []
      : (visualAdjustment.overlays ?? []);
    syncVisualAdjustmentOverlays(frameVisualAdjustmentOverlaysRef.current, [
      ...adjustmentOverlays.filter((overlay) => overlay.target === "frame"),
      ...(visualTransition.overlays?.filter(
        (overlay) => overlay.target === "frame",
      ) ?? []),
    ]);
    syncVisualAdjustmentOverlays(cameraVisualAdjustmentOverlaysRef.current, [
      ...adjustmentOverlays.filter(
        (overlay) => (overlay.target ?? "camera") === "camera",
      ),
      ...(visualTransition.overlays?.filter(
        (overlay) => (overlay.target ?? "camera") === "camera",
      ) ?? []),
    ]);
  }, [
    useTransitionComposite,
    visualAdjustment.overlays,
    visualTransition.overlays,
  ]);

  useEffect(() => {
    if (!interactiveTrackerPicking) setTrackerHoverTarget(null);
  }, [interactiveTrackerPicking]);

  function updateObjectHover(event: PointerEvent<HTMLDivElement>) {
    if (marqueeDragging) {
      if (hoveredObjectIdRef.current) {
        hoveredObjectIdRef.current = null;
        setHoveredObjectId(null);
      }
      return;
    }

    let nextId: string | null = null;
    for (const element of document.elementsFromPoint(
      event.clientX,
      event.clientY,
    )) {
      const radiusHandle =
        element instanceof HTMLElement
          ? element.closest<HTMLElement>("[data-radius-handle-object-id]")
          : null;
      if (radiusHandle?.dataset.radiusHandleObjectId) {
        nextId = radiusHandle.dataset.radiusHandleObjectId;
        break;
      }
      const target =
        element instanceof HTMLElement
          ? element.closest<HTMLElement>("[data-object-id]")
          : null;
      if (target?.dataset.objectId) {
        nextId = target.dataset.objectId;
        break;
      }
    }
    if (nextId === hoveredObjectIdRef.current) return;
    hoveredObjectIdRef.current = nextId;
    setHoveredObjectId(nextId);
  }

  function handleFramePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (isPlaying) return;
    if (composeAuthor3dActive) return;
    if (interactiveTrackerPicking) updateTrackerHover(event);
    updateObjectHover(event);
    onFramePointerMove(event);
  }

  function handleFramePointerDownCapture(event: PointerEvent<HTMLDivElement>) {
    if (isPlaying) return;
    if (composeAuthor3dActive) return;
    if (
      activeShapeTool === "pen" ||
      activeShapeTool === "pencil" ||
      activeShapeTool === "textPath"
    ) {
      event.preventDefault();
      event.stopPropagation();
      onFramePointerDown(event);
      return;
    }
    if (activeShapeTool === "text") {
      const targetEl = event.target as HTMLElement;
      const insideEditable = targetEl.closest<HTMLElement>(
        '[contenteditable="true"]',
      );
      if (insideEditable) return;
      const hitElement = targetEl.closest<HTMLElement>("[data-object-id]");
      if (hitElement) {
        const hitObjectId = hitElement.dataset.objectId;
        if (hitObjectId) {
          const hitObject = displayPart.objects.find(
            (o) => o.id === hitObjectId,
          );
          if (
            hitObject &&
            (hitObject.type === "text" || isEditableTextPathObject(hitObject))
          ) {
            event.preventDefault();
            event.stopPropagation();
            onTextObjectDoubleClick(
              event as unknown as ReactMouseEvent<HTMLDivElement>,
              hitObject,
            );
            return;
          }
        }
      }
    }
    if (!interactiveTrackerPicking) {
      onFramePointerDownCapture(event);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onTrackerTargetPick(getTrackerTargetFromPoint(event).id ?? "");
    setTrackerHoverTarget(null);
  }

  function updateTrackerHover(event: PointerEvent<HTMLDivElement>) {
    const target = getTrackerTargetFromPoint(event);
    setTrackerHoverTarget(
      target.id && target.viewportBounds
        ? { id: target.id, viewportBounds: target.viewportBounds }
        : null,
    );
  }

  function getTrackerTargetFromPoint(event: PointerEvent<HTMLDivElement>) {
    const frameRect = frameViewportRef.current?.getBoundingClientRect();
    if (!frameRect) return { id: "", viewportBounds: null };

    for (const element of document.elementsFromPoint(
      event.clientX,
      event.clientY,
    )) {
      const target =
        element instanceof HTMLElement
          ? element.closest<HTMLElement>(
              "[data-object-id],[data-background-element-id]",
            )
          : null;
      const id =
        target?.dataset.objectId ?? target?.dataset.backgroundElementId;
      if (!target || !id) continue;
      const targetRect = target.getBoundingClientRect();
      return {
        id,
        viewportBounds: {
          x: targetRect.left - frameRect.left,
          y: targetRect.top - frameRect.top,
          width: targetRect.width,
          height: targetRect.height,
        },
      };
    }

    return { id: "", viewportBounds: null };
  }

  function clearSelectorHover(event?: PointerEvent<HTMLDivElement>) {
    const relatedTarget = event?.relatedTarget;
    if (
      relatedTarget instanceof HTMLElement &&
      relatedTarget.closest("[data-radius-handle-object-id]")
    )
      return;
    if (hoveredObjectIdRef.current) {
      hoveredObjectIdRef.current = null;
      setHoveredObjectId(null);
    }
    setTrackerHoverTarget(null);
  }

  return (
    <div
      data-clipper-frame-preview-wrapper
      style={
        composeAuthor3dActive ? { position: "absolute", inset: 0 } : undefined
      }
    >
      <div
        className="relative overflow-visible"
        data-clipper-frame-preview-shell
        style={viewportOverlayStyle}
      >
        <div
          ref={frameViewportRef}
          className={`absolute overflow-hidden ${!isPlaying && (interactiveFocusPicking || interactiveTrackerPicking) ? "cursor-crosshair ring-2 ring-[#159dff]" : activeShapeTool === "text" || activeShapeTool === "textPath" ? "cursor-text" : activeShapeTool ? "cursor-crosshair" : ""}`}
          data-clipper-frame-preview
          style={clippedViewportStyle}
          onPointerDownCapture={handleFramePointerDownCapture}
          onPointerDown={
            isPlaying || composeAuthor3dActive ? undefined : onFramePointerDown
          }
          onPointerMove={handleFramePointerMove}
          onPointerUp={
            isPlaying || composeAuthor3dActive ? undefined : onFramePointerUp
          }
          onPointerCancel={
            isPlaying || composeAuthor3dActive
              ? undefined
              : onFramePointerCancel
          }
          onPointerLeave={(event) => {
            clearSelectorHover(event);
            onFramePointerLeave(event);
          }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left overflow-hidden"
            data-clipper-frame-content
            style={frameStyle}
          >
            <div
              className="absolute inset-0"
              data-clipper-perspective-stage
              style={perspectiveStageStyle}
            >
              {isUnlinkedPart || compHidden || compositionError ? (
                <div className="absolute inset-0 bg-black" ref={cameraRef}>
                  {compositionError ? (
                    <CompositionErrorOverlay
                      filePath={displayPart.filePath}
                      message={compositionError}
                    />
                  ) : null}
                </div>
              ) : (
                <PreviewRenderProvider
                  initial={{
                    timelineMode,
                    renderMode,
                    isPlaying,
                    canSelect:
                      !isPlaying &&
                      (canSelectObjects || interactiveTrackerPicking),
                    frameScale,
                    animationsEnabled,
                  }}
                >
                  <SceneCompositor
                    cameraRef={cameraRef}
                    isPostProcessSource={isPostProcessSource}
                    filePath={displayPart.filePath}
                    resetKey={`${displayPart.id}:${displayPart.filePath}:${compositionError ?? ""}`}
                    sceneCamera={liveCameraTransform}
                    visualAdjustmentStyle={visualAdjustmentStyle}
                    transitionCameraStyle={transitionCameraStyle}
                    frameVisualAdjustmentOverlaysRef={
                      frameVisualAdjustmentOverlaysRef
                    }
                    transitionPreviewParts={transitionPreviewParts ?? null}
                    prewarmParts={prewarmParts}
                    transitionProgress={transitionProgress}
                    transitionSequenceStyle={transitionSequenceStyle}
                    stackPreviewParts={stackPreviewParts}
                    activePartId={displayPart.id}
                    renderMode={renderMode}
                    isPlaying={isPlaying}
                    animationsEnabled={animationsEnabled}
                    frameScale={frameScale}
                    previewFps={previewFps}
                    exportTileFrameBounds={exportTileFrameBounds}
                    adjustmentLayers={adjustmentLayers}
                    transitionLayers={transitionLayers}
                    displaySceneTime={displaySceneTime}
                    canSelect={
                      !isPlaying &&
                      (canSelectObjects || interactiveTrackerPicking)
                    }
                    activeShapeTool={activeShapeTool}
                    handToolActive={handToolActive}
                    editingTextObjectId={interactiveEditingTextObjectId}
                    hideNullObjects={sceneWrap.hideNullObjects}
                    flattenComposition={sceneWrap.flattenComposition}
                    focusPicking={
                      !isPlaying &&
                      (interactiveFocusPicking || interactiveTrackerPicking)
                    }
                    onObjectPointerDown={onObjectPointerDown}
                    onObjectContextMenu={onObjectContextMenu}
                    onTextEditCommit={onTextEditCommit}
                    onTextEditEnd={onTextEditEnd}
                    onTextObjectDoubleClick={onTextObjectDoubleClick}
                    compositionLibrary={compositionLibrary}
                    compositionAncestors={[
                      displayPart.compositionId ?? displayPart.id,
                    ]}
                    onSubcompositionDoubleClick={onSubcompositionDoubleClick}
                    selectedObjectId={selectedObjectId}
                    onCameraPropsChange={onCameraPropsChange}
                    onCameraPathEaseChange={onCameraPathEaseChange}
                    onSelectObject={onSelectObject}
                    onAuthorPreviewModeChange={setComposeAuthorPreviewMode}
                    authorViewState={effectiveAuthorViewState}
                    onAuthorViewStateChange={onAuthorViewStateChange}
                    onObjectTransformChange={onObjectTransformChange}
                    onAuthorPreviewContextMenu={onAuthorPreviewContextMenu}
                  />
                </PreviewRenderProvider>
              )}
            </div>
            <div
              ref={cameraVisualAdjustmentOverlaysRef}
              className="pointer-events-none absolute inset-0"
              data-clipper-visual-adjustment-overlays="camera"
              style={{ zIndex: 2147483647 }}
            />
          </div>
          {!composeAuthor3dActive &&
          interactiveTrackerPicking &&
          trackerHoverTarget ? (
            <TrackerTargetOverlay target={trackerHoverTarget} />
          ) : null}
          {!composeAuthor3dActive && interactiveDragBox ? (
            <DragSelectionBox
              dragSelectionBoxRef={dragSelectionBoxRef}
              bounds={interactiveDragBox}
              cameraTransform={liveCameraTransform}
              frameScale={frameScale}
              frameViewportRef={frameViewportRef}
              portalHost={previewOverlayHost}
              uiScale={selectionOverlayScale}
              visible={Boolean(showDragBox)}
            />
          ) : null}
          {!composeAuthor3dActive &&
            interactiveObjectSnapGuides.map((guide, index) => (
              <SnapGuideOverlay
                key={`${guide.axis}:${guide.position}:${index}`}
                cameraTransform={liveCameraTransform}
                guide={guide}
                frameScale={frameScale}
              />
            ))}
          {!composeAuthor3dActive && interactiveFramePickPoint ? (
            <FramePickPointOverlay
              point={interactiveFramePickPoint}
              frameScale={frameScale}
            />
          ) : null}
          {!composeAuthor3dActive ? <FramePickPointImperativeOverlay /> : null}
          {!composeAuthor3dActive &&
          showShapeDrawPreview &&
          shapeDrawPreview &&
          activeShapeTool ? (
            <ShapeDrawPreviewOverlay
              preview={shapeDrawPreview}
              frameScale={frameScale}
              tool={activeShapeTool}
            />
          ) : null}
        </div>
      </div>
      {showShapeDrawPreview &&
      shapeDrawPreview &&
      activeShapeTool &&
      previewOverlayHost
        ? createPortal(
            <ShapeDrawPreviewControlsOverlay
              cameraTransform={liveCameraTransform}
              frameScale={frameScale}
              frameViewportRef={frameViewportRef}
              preview={shapeDrawPreview}
              portalHost={previewOverlayHost}
            />,
            previewOverlayHost,
          )
        : null}
      {composeAuthorViewActive && previewOverlayHost
        ? createPortal(
            <AuthorPreviewModeControls
              previewMode={composeAuthorPreviewMode}
              onChange={(mode) => {
                setComposeAuthorPreviewMode(mode);
                onAuthorViewStateChange?.({ previewMode: mode });
              }}
            />,
            previewOverlayHost,
          )
        : null}
      {!composeAuthor3dActive &&
      canSelectObjects &&
      !isUnlinkedPart &&
      previewOverlayHost
        ? createPortal(
            selectedPreviewObjects.map((object) => {
              const source = evaluatedSelectableObjectsById.get(object.id);
              const isBackgroundSelection =
                object.id === displayPart.background.id;
              const isTextPath = source
                ? isEditableTextPathObject(source)
                : false;
              const liveBounds = source?.bounds ?? object.bounds;
              return (
                <Fragment key={object.id}>
                  <SelectionOverlayBox
                    objectId={object.id}
                    bounds={liveBounds}
                    cameraTransform={liveCameraTransform}
                    frameScale={frameScale}
                    frameViewportRef={frameViewportRef}
                    handleSizePx={selectionHandleSizePx}
                    highlighted={hoveredObjectId === object.id}
                    interactive={!marqueeDragging && !isBackgroundSelection}
                    offsetPx={selectionOffsetPx}
                    portal
                    portalHost={previewOverlayHost}
                    radius={
                      !isBackgroundSelection && source?.type === "rect"
                        ? getNumericStyleValue(source.style.borderRadius)
                        : undefined
                    }
                    resizable={
                      !isBackgroundSelection && source?.type !== "null"
                    }
                    uiScale={selectionOverlayScale}
                    onCornerRadiusChange={
                      !isBackgroundSelection && onObjectCornerRadiusChange
                        ? (radius) =>
                            onObjectCornerRadiusChange(object.id, radius)
                        : undefined
                    }
                    onResizePointerDown={(event, handle) =>
                      onObjectResizePointerDown(event, handle, object.id)
                    }
                  />
                  {isTextPath && source && (
                    <TextPathTraceOverlay
                      object={source}
                      frameViewportRef={frameViewportRef}
                    />
                  )}
                  {source &&
                  editingTextObjectId !== source.id &&
                  !(
                    activeShapeTool === "text" &&
                    isEditableTextPathObject(source)
                  ) &&
                  onPathControlPointerDown ? (
                    <PathEditOverlay
                      cameraTransform={liveCameraTransform}
                      frameScale={frameScale}
                      frameViewportRef={frameViewportRef}
                      object={source}
                      onPathControlPointerDown={onPathControlPointerDown}
                      portalHost={previewOverlayHost}
                    />
                  ) : null}
                  {source &&
                  !editingTextObjectId &&
                  isEditableTextPathObject(source) &&
                  onTextPathOffsetChange ? (
                    <TextPathOffsetHandle
                      cameraTransform={liveCameraTransform}
                      frameScale={frameScale}
                      frameViewportRef={frameViewportRef}
                      object={source}
                      onTextPathOffsetChange={onTextPathOffsetChange}
                      portalHost={previewOverlayHost}
                    />
                  ) : null}
                </Fragment>
              );
            }),
            previewOverlayHost,
          )
        : null}
    </div>
  );
});

function AuthorPreviewModeControls({
  previewMode,
  onChange,
}: {
  previewMode: CameraPreviewMode;
  onChange: (mode: CameraPreviewMode) => void;
}) {
  const previewButtonClass = (mode: CameraPreviewMode) =>
    `grid h-7 w-7 place-items-center rounded-[6px] text-[11px] font-bold leading-none outline-none transition focus-visible:ring-2 focus-visible:ring-[rgb(var(--clipper-accent-rgb)/0.32)] ${
      previewMode === mode
        ? "bg-[var(--clipper-accent)] text-[var(--clipper-accent-foreground)]"
        : "text-[#c8cedc] hover:bg-[#242936] hover:text-white"
    }`;

  return (
    <div
      className="pointer-events-auto absolute bottom-3 right-3 rounded-[9px] border border-[#2d313b] bg-[#151820]/95 p-1 shadow-[0_14px_38px_rgba(0,0,0,0.36),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur"
      style={{ zIndex: 2147483647 }}
      data-clipper-author-preview-mode-controls
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-1">
        <button
          className={previewButtonClass("side-by-side")}
          onClick={() => onChange("side-by-side")}
          title="Side by side"
          aria-label="Side by side"
        >
          <SquareSplitHorizontal size={14} />
        </button>
        <button
          className={previewButtonClass("pip")}
          onClick={() => onChange("pip")}
          title="Picture in picture"
          aria-label="Picture in picture"
        >
          <PictureInPicture2 size={14} />
        </button>
        <button
          className={previewButtonClass("2d")}
          onClick={() => onChange("2d")}
        >
          2D
        </button>
      </div>
    </div>
  );
}

const areFramePreviewPropsEqual = () => false;

export class FramePreviewRenderBoundary extends ReactComponent<
  { children: ReactNode; filePath: string; resetKey: string },
  { error: string | null }
> {
  state: { error: string | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: framePreviewErrorMessage(error) };
  }

  componentDidUpdate(previousProps: { resetKey: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error)
      this.setState({ error: null });
  }

  componentDidCatch(error: unknown) {
    console.error("FramePreview render failed", error);
  }

  render() {
    if (this.state.error)
      return (
        <CompositionErrorOverlay
          filePath={this.props.filePath}
          message={this.state.error}
          title="Preview render failed"
        />
      );
    return this.props.children;
  }
}

function CompositionErrorOverlay({
  filePath,
  message,
  title = "Composition failed to load",
}: {
  filePath: string;
  message: string;
  title?: string;
}) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#07090d] p-16 text-[#ffd6d6]">
      <div className="max-w-[1080px] rounded-[28px] border border-[#5a222c] bg-[#1a0f13]/95 p-10 shadow-[0_26px_90px_rgba(0,0,0,0.55)]">
        <div className="text-[22px] font-extrabold tracking-tight text-[#ff6b7a]">
          {title}
        </div>
        <div className="mt-2 break-all font-mono text-[15px] text-[#a7adbb]">
          {filePath}
        </div>
        <pre className="mt-6 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-[18px] border border-[#3b2a2a] bg-[#090b10] p-5 font-mono text-[20px] leading-relaxed text-[#ffd6d6]">
          {message}
        </pre>
      </div>
    </div>
  );
}

function framePreviewErrorMessage(error: unknown) {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}

function syncVisualAdjustmentOverlays(
  container: HTMLElement | null,
  overlays: AdjustmentVisualOverlay[] | undefined,
) {
  if (!container) return;
  container.replaceChildren(
    ...(overlays ?? []).map((overlay) => {
      const element = document.createElement("div");
      element.className = "pointer-events-none absolute inset-0";
      element.style.zIndex = "2147483647";
      Object.assign(element.style, overlay.style);
      element.style.pointerEvents = "none";
      return element;
    }),
  );
}

function applyLivePartPreviewTime(
  root: HTMLElement | null,
  part: Part,
  time: number,
) {
  if (!root) return;
  if (!part.background.hidden) {
    const evaluatedBackground = evaluateBackgroundLayer(
      part.background,
      time,
      part.duration,
      { animations: true },
    );
    const backgroundElement = root.querySelector<HTMLElement>(
      `[data-layer-id="${cssEscape(part.background.id)}"]`,
    );
    if (backgroundElement)
      applyLivePreviewLayerStyle(
        backgroundElement,
        evaluatedBackground.renderStyle,
      );
    const backgroundFillElement = root.querySelector<HTMLElement>(
      `[data-background-fill-id="${cssEscape(part.background.id)}"]`,
    );
    if (backgroundFillElement)
      applyLivePreviewStyle(
        backgroundFillElement,
        evaluatedBackground.fillStyle,
      );
    for (const element of evaluatedBackground.elements) {
      const target = root.querySelector<HTMLElement>(
        `[data-background-element-id="${cssEscape(element.id)}"]`,
      );
      if (target) applyLivePreviewObject(target, element);
    }
  }
  const parentTransforms = buildFrameObjectParentTransformLookup(
    part.objects,
    time,
    part.duration,
    true,
  );
  for (const object of part.objects) {
    const target = root.querySelector<HTMLElement>(
      `[data-clipper-render-object-id="${cssEscape(object.id)}"]`,
    );
    if (target)
      applyLivePreviewObject(
        target,
        evaluateFrameObject(object, time, part.duration, {
          animations: true,
        }),
        parentTransforms.get(object.id),
      );
  }
}

function applyLivePreviewObject(
  target: HTMLElement,
  object: EvaluatedFrameObject,
  parentTransform?: string,
) {
  applyLivePreviewObjectStyle(target, object, parentTransform);
  if (
    object.renderContent !== undefined &&
    object.renderContent !== object.content &&
    target.textContent !== object.renderContent
  )
    target.textContent = object.renderContent;
}

function applyLivePreviewObjectStyle(
  target: HTMLElement,
  object: EvaluatedFrameObject,
  parentTransform?: string,
) {
  const objectTransform =
    typeof object.style.transform === "string"
      ? object.style.transform
      : undefined;
  const animationTransform =
    typeof object.renderStyle.transform === "string"
      ? object.renderStyle.transform
      : undefined;
  applyLivePreviewStyle(target, object.renderStyle);
  target.style.transform =
    `${parentTransform ?? ""} translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px)) ${animationTransform ?? ""} ${objectTransform ?? ""}`.trim();
  setLiveStyleValue(
    target,
    "opacity",
    object.renderStyle.opacity ?? object.style.opacity,
  );
  setLiveStyleValue(
    target,
    "color",
    object.renderStyle.color ?? object.style.color,
  );
  setLiveStyleValue(
    target,
    "backgroundColor",
    object.renderStyle.backgroundColor ?? object.style.backgroundColor,
  );
}

function applyLivePreviewLayerStyle(
  target: HTMLElement,
  style: Record<string, string | number | undefined>,
) {
  applyLivePreviewStyle(target, style);
}

function setLiveStyleValue(
  target: HTMLElement,
  key: "transform" | "opacity" | "color" | "backgroundColor",
  value: string | number | undefined,
) {
  if (value === undefined) target.style[key] = "";
  else target.style[key] = String(value);
}

function applyLivePreviewStyle(
  target: HTMLElement,
  style: Record<string, string | number | undefined>,
) {
  for (const [key, value] of Object.entries(style)) {
    const property = cssStylePropertyName(key);
    if (value === undefined) target.style.removeProperty(property);
    else target.style.setProperty(property, String(value));
  }
}

function cssStylePropertyName(key: string) {
  return key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

function cssEscape(value: string) {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/"/g, '\\"');
}

function TrackerTargetOverlay({
  target,
}: {
  target: { id: string; viewportBounds: Bounds };
}) {
  const viewportBounds = insetBounds(target.viewportBounds, -selectorOffsetPx);

  return (
    <div
      className="pointer-events-none absolute border bg-[#159dff]/10 shadow-[0_0_0_1px_rgba(21,157,255,0.18)]"
      style={{
        borderColor: selectorBlue,
        left: viewportBounds.x,
        top: viewportBounds.y,
        width: viewportBounds.width,
        height: viewportBounds.height,
        zIndex: 72,
      }}
    >
      <span className="absolute left-0 top-0 -translate-y-full whitespace-nowrap bg-[#159dff] px-1.5 py-0.5 text-[10px] font-normal leading-none text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
        {target.id}
      </span>
    </div>
  );
}

export function TransitionCompositeView({
  adjustmentLayers,
  animationsEnabled,
  exportTileFrameBounds,
  flattenComposition = false,
  frameScale,
  isPlaying,
  renderMode,
  sequenceStyle,
  transitionLayers,
  transitionPreviewParts,
}: {
  adjustmentLayers?: AdjustmentLayer[];
  animationsEnabled: boolean;
  exportTileFrameBounds?: ExportTileFrameBounds;
  flattenComposition?: boolean;
  frameScale: number;
  isPlaying: boolean;
  renderMode: "preview" | "export";
  sequenceStyle: TransitionSequenceStyle | undefined;
  transitionLayers?: TransitionLayer[];
  transitionPreviewParts: {
    from: Array<{ part: Part; start: number; previewTime: number }>;
    to: Array<{ part: Part; start: number; previewTime: number }>;
    fromSceneTime: number;
    toSceneTime: number;
  };
}) {
  const frameStyle = sequenceStyle?.frameStyle as CSSProperties | undefined;
  const aStyle = sequenceStyle?.aStyle as CSSProperties | undefined;
  const bStyle = sequenceStyle?.bStyle as CSSProperties | undefined;
  const fromAdjustment = useMemo(
    () =>
      applyAdjustmentLayersToVisualStyle(
        transitionPreviewParts.fromSceneTime,
        adjustmentLayers,
      ),
    [adjustmentLayers, transitionPreviewParts.fromSceneTime],
  );
  const toAdjustment = useMemo(
    () =>
      applyAdjustmentLayersToVisualStyle(
        transitionPreviewParts.toSceneTime,
        adjustmentLayers,
      ),
    [adjustmentLayers, transitionPreviewParts.toSceneTime],
  );

  return (
    <div className="absolute inset-0 overflow-hidden" style={frameStyle}>
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          ...aStyle,
          willChange: renderMode === "export" ? undefined : "transform",
        }}
      >
        <TimelineSequenceView
          adjustment={fromAdjustment}
          animationsEnabled={animationsEnabled}
          exportTileFrameBounds={exportTileFrameBounds}
          flattenComposition={flattenComposition}
          frameScale={frameScale}
          isPlaying={isPlaying}
          parts={transitionPreviewParts.from}
          renderMode={renderMode}
          sceneTime={transitionPreviewParts.fromSceneTime}
          sequenceKey="from"
          transitionLayers={transitionLayers}
        />
      </div>
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          ...bStyle,
          willChange: renderMode === "export" ? undefined : "transform",
        }}
      >
        <TimelineSequenceView
          adjustment={toAdjustment}
          animationsEnabled={animationsEnabled}
          exportTileFrameBounds={exportTileFrameBounds}
          flattenComposition={flattenComposition}
          frameScale={frameScale}
          isPlaying={isPlaying}
          parts={transitionPreviewParts.to}
          renderMode={renderMode}
          sceneTime={transitionPreviewParts.toSceneTime}
          sequenceKey="to"
          transitionLayers={transitionLayers}
        />
      </div>
    </div>
  );
}

function TimelineSequenceView({
  adjustment,
  animationsEnabled,
  exportTileFrameBounds,
  flattenComposition,
  frameScale,
  isPlaying,
  parts,
  renderMode,
  sceneTime,
  sequenceKey,
  transitionLayers,
}: {
  adjustment: ReturnType<typeof applyAdjustmentLayersToVisualStyle>;
  animationsEnabled: boolean;
  exportTileFrameBounds?: ExportTileFrameBounds;
  flattenComposition: boolean;
  frameScale: number;
  isPlaying: boolean;
  parts: Array<{ part: Part; start: number; previewTime: number }>;
  renderMode: "preview" | "export";
  sceneTime: number;
  sequenceKey: string;
  transitionLayers?: TransitionLayer[];
}) {
  const visualStyle = { filter: adjustment.filter } as CSSProperties;
  return (
    <div className="absolute inset-0" style={visualStyle}>
      {parts.map((item) => (
        <TimelineSequenceCompositionItem
          key={`${sequenceKey}:${item.part.id}:${item.start}`}
          animationsEnabled={animationsEnabled}
          exportTileFrameBounds={exportTileFrameBounds}
          flattenComposition={flattenComposition}
          frameScale={frameScale}
          isPlaying={isPlaying}
          part={item.part}
          previewTime={item.previewTime}
          renderClockSceneTime={sceneTime}
          renderMode={renderMode}
          transitionLayers={transitionLayers}
        />
      ))}
      {adjustment.overlays?.map((overlay) => (
        <div
          key={overlay.id}
          className="pointer-events-none absolute inset-0"
          style={{
            zIndex: 2147483647,
            ...overlay.style,
            pointerEvents: "none",
          }}
        />
      ))}
    </div>
  );
}

export function getActiveTransitionLayer(
  sceneTime: number,
  layers: TransitionLayer[] | undefined,
) {
  return (
    layers?.find(
      (item) =>
        sceneTime >= item.start &&
        sceneTime <=
          item.start +
            getTransitionFinishTime(item) +
            transitionEndpointEpsilonSeconds,
    ) ?? null
  );
}

function noopObjectPointerDown() {}
function noopTextEditCommit() {}
function noopTextDoubleClick() {}

function TimelineSequenceCompositionItem({
  animationsEnabled,
  exportTileFrameBounds,
  flattenComposition,
  frameScale,
  isPlaying,
  part,
  previewTime,
  renderClockSceneTime,
  renderMode,
  transitionLayers,
}: {
  animationsEnabled: boolean;
  exportTileFrameBounds?: ExportTileFrameBounds;
  flattenComposition: boolean;
  frameScale: number;
  isPlaying: boolean;
  part: Part;
  previewTime: number;
  renderClockSceneTime: number;
  renderMode: "preview" | "export";
  transitionLayers?: TransitionLayer[];
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const Backend = flattenComposition ? RasterBackend : DomBackend;
  return (
    <Backend
      active={false}
      animationsEnabled={animationsEnabled}
      canSelect={false}
      duration={part.duration}
      editingTextObjectId={null}
      exportTileFrameBounds={exportTileFrameBounds}
      focusPicking={false}
      frameScale={frameScale}
      hideNullObjects={false}
      hostRef={hostRef}
      isPlaying={isPlaying}
      localTime={previewTime}
      part={part}
      renderClockSceneTime={renderClockSceneTime}
      renderMode={renderMode}
      transitionLayers={flattenComposition ? transitionLayers : undefined}
      onObjectPointerDown={noopObjectPointerDown}
      onTextEditCommit={noopTextEditCommit}
      onTextObjectDoubleClick={noopTextDoubleClick}
    />
  );
}

export function FramePickPointOverlay({
  point,
  frameScale,
}: {
  point: Point;
  frameScale: number;
}) {
  return (
    <div
      className="pointer-events-none absolute z-20"
      data-clipper-frame-pick-point
      style={{
        transform: `translate3d(${point.x * frameScale}px, ${point.y * frameScale}px, 0)`,
      }}
    >
      <span className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 bg-[#159dff] shadow-[0_2px_10px_rgba(0,0,0,0.42)]" />
    </div>
  );
}

function SnapGuideOverlay({
  cameraTransform,
  guide,
  frameScale,
}: {
  cameraTransform: CameraPreviewTransform;
  guide: ObjectSnapGuide;
  frameScale: number;
}) {
  const viewportBounds =
    guide.axis === "x"
      ? boundsToViewport(
          { x: guide.position, y: 0, width: 0, height: FRAME_HEIGHT },
          cameraTransform,
          frameScale,
        )
      : boundsToViewport(
          { x: 0, y: guide.position, width: FRAME_WIDTH, height: 0 },
          cameraTransform,
          frameScale,
        );
  const style =
    guide.axis === "x"
      ? {
          left: viewportBounds.x,
          top: viewportBounds.y,
          width: 1,
          height: viewportBounds.height,
        }
      : {
          left: viewportBounds.x,
          top: viewportBounds.y,
          width: viewportBounds.width,
          height: 1,
        };
  return (
    <div
      className="pointer-events-none absolute bg-red-500 shadow-[0_0_0_1px_rgba(239,68,68,0.35)]"
      data-clipper-object-snap-guide
      style={{ ...style, zIndex: 80 }}
    />
  );
}

function FramePickPointImperativeOverlay() {
  return (
    <div
      className="pointer-events-none absolute z-20 opacity-0"
      data-clipper-motion-pick-preview
      style={{ transform: "translate3d(0px, 0px, 0)" }}
    >
      <span className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 bg-[#159dff] shadow-[0_2px_10px_rgba(0,0,0,0.42)]" />
    </div>
  );
}

function TextPathOffsetHandle({
  cameraTransform,
  frameScale,
  frameViewportRef,
  object,
  onTextPathOffsetChange,
  portalHost,
}: {
  cameraTransform: CameraPreviewTransform;
  frameScale: number;
  frameViewportRef: RefObject<HTMLDivElement | null>;
  object: FrameObject;
  onTextPathOffsetChange: (
    objectId: string,
    offset: number,
    options?: { history?: boolean },
  ) => void;
  portalHost: HTMLElement;
}) {
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const offset = getTextPathOffset(object.content);

  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  const syncOffsetHandle = useCallback(() => {
    const handle = handleRef.current;
    const viewport = frameViewportRef.current;
    if (handle && viewport) {
      // Use live bounds from the preview cache (populated during scrubbing/playback)
      // falling back to the React-state bounds when not animating.
      const liveBounds =
        objectPreviewBoundsById.get(object.id) ?? object.bounds;
      const overlayTransform = getCurrentFramePortalOverlayTransform({
        cameraTransform,
        frameScale,
        frameViewportRef,
        portalHost,
      });
      const viewportPoint = boundsToViewport(
        {
          x: liveBounds.x + liveBounds.width * (offsetRef.current / 100),
          y: liveBounds.y + liveBounds.height / 2,
          width: 0,
          height: 0,
        },
        cameraTransform,
        frameScale,
      );
      const portalPoint = viewportPointToPortal(
        viewportPoint,
        overlayTransform,
      );
      handle.style.setProperty(
        "--clipper-text-path-offset-x",
        `${portalPoint.x}px`,
      );
      handle.style.setProperty(
        "--clipper-text-path-offset-y",
        `${portalPoint.y}px`,
      );
    }
  }, [
    cameraTransform,
    frameScale,
    frameViewportRef,
    object.bounds,
    object.id,
    portalHost,
  ]);
  usePortalOverlayFrameSync(syncOffsetHandle);

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startClientX = event.clientX;
    const startOffset = offset;
    const startLeft = handleRef.current?.style.getPropertyValue(
      "--clipper-text-path-offset-x",
    );
    const bounds = boundsToViewport(object.bounds, cameraTransform, frameScale);
    const pxPerPercent = Math.max(bounds.width / 100, 0.1);
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    let latestOffset = startOffset;
    let frameId = 0;
    const move = (nativeEvent: globalThis.PointerEvent) => {
      latestOffset = clamp(
        startOffset + (nativeEvent.clientX - startClientX) / pxPerPercent,
        0,
        100,
      );
      if (startLeft) {
        target.style.setProperty(
          "--clipper-text-path-offset-x",
          `calc(${startLeft} + ${(latestOffset - startOffset) * pxPerPercent}px)`,
        );
      }
      const textPath =
        frameViewportRef.current?.querySelector<SVGTextPathElement>(
          `[data-clipper-render-object-id="${cssEscape(object.id)}"] textPath`,
        );
      textPath?.setAttribute("startOffset", `${latestOffset.toFixed(2)}%`);
      if (!frameId) {
        frameId = requestAnimationFrame(() => {
          frameId = 0;
          onTextPathOffsetChange(object.id, latestOffset, { history: false });
        });
      }
    };
    const up = () => {
      if (frameId) cancelAnimationFrame(frameId);
      onTextPathOffsetChange(object.id, latestOffset, { history: true });
      target.releasePointerCapture(event.pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-frame-overlay-follow={object.id}
      style={{
        transform:
          "translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px))",
        zIndex: 2147483647,
      }}
    >
      <button
        ref={handleRef}
        className="pointer-events-auto absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#159dff] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
        data-text-path-offset-handle={object.id}
        onPointerDown={startDrag}
        style={{
          left: "var(--clipper-text-path-offset-x, -9999px)",
          top: "var(--clipper-text-path-offset-y, -9999px)",
        }}
        title="Move text along path"
        type="button"
      />
    </div>
  );
}

type EditablePathSegment = {
  kind: "line" | "curve";
  start: Point;
  end: Point;
  c1?: Point;
  c2?: Point;
};

function parseEditablePath(object: FrameObject) {
  const raw = object.style.clipperPath;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw) as {
      tool?: string;
      segments?: EditablePathSegment[];
    };
    if (!Array.isArray(parsed.segments)) return null;
    return transformPathGeometrySegmentsToBounds(
      parsed.segments,
      object.bounds,
    );
  } catch {
    return null;
  }
}

function isEditableTextPathObject(object: FrameObject) {
  const raw = object.style.clipperPath;
  if (typeof raw !== "string") return false;
  try {
    return (JSON.parse(raw) as { tool?: string }).tool === "textPath";
  } catch {
    return false;
  }
}

function getCubicPoint(
  start: Point,
  c1: Point,
  c2: Point,
  end: Point,
  t: number,
) {
  const mt = 1 - t;
  return {
    x:
      mt * mt * mt * start.x +
      3 * mt * mt * t * c1.x +
      3 * mt * t * t * c2.x +
      t * t * t * end.x,
    y:
      mt * mt * mt * start.y +
      3 * mt * mt * t * c1.y +
      3 * mt * t * t * c2.y +
      t * t * t * end.y,
  };
}

function getEditableSegmentHitLines(
  segment: EditablePathSegment,
  segmentIndex: number,
) {
  if (segment.kind !== "curve" || !segment.c1 || !segment.c2) {
    return [
      {
        key: `${segmentIndex}:0`,
        segmentIndex,
        from: segment.start,
        to: segment.end,
      },
    ];
  }

  const steps = 24;
  const points = Array.from({ length: steps + 1 }, (_, index) =>
    getCubicPoint(
      segment.start,
      segment.c1!,
      segment.c2!,
      segment.end,
      index / steps,
    ),
  );
  return points.slice(0, -1).map((from, index) => ({
    key: `${segmentIndex}:${index}`,
    segmentIndex,
    from,
    to: points[index + 1],
  }));
}

function getTextPathEditableContent(content: string | undefined) {
  if (!content) return "Text on path";
  const match = content.match(/<textPath\b[^>]*>([\s\S]*?)<\/textPath>/);
  return decodeXmlText(match?.[1]?.trim() || "Text on path");
}

function getTextPathOffset(content: string | undefined) {
  if (!content) return 50;
  const match = content.match(/<textPath\b[^>]*\sstartOffset="([^"]+)"/);
  const raw = match?.[1] ?? "50%";
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? clamp(value, 0, 100) : 50;
}

function decodeXmlText(value: string) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

const objectPreviewBoundsById = new Map<string, Bounds>();

let pendingTextEditClick: { clientX: number; clientY: number } | null = null;

export function setPendingTextEditClick(
  point: {
    clientX: number;
    clientY: number;
  } | null,
) {
  pendingTextEditClick = point;
}

function TextPathTraceOverlay({
  object,
  frameViewportRef,
}: {
  object: FrameObject;
  frameViewportRef: RefObject<HTMLDivElement | null>;
}) {
  useLayoutEffect(() => {
    let frameId = 0;
    let tracedPath: SVGPathElement | null = null;
    let previousAttributes: Record<string, string | null> | null = null;
    const traceAttributes = {
      fill: "none",
      opacity: "0.8",
      stroke: "#8fbff7",
      "stroke-dasharray": "6 4",
      "stroke-linecap": "round",
      "stroke-width": "2",
      "vector-effect": "non-scaling-stroke",
    };

    function restorePath() {
      if (!tracedPath || !previousAttributes) return;
      for (const [name, value] of Object.entries(previousAttributes)) {
        if (value === null) tracedPath.removeAttribute(name);
        else tracedPath.setAttribute(name, value);
      }
      tracedPath = null;
      previousAttributes = null;
    }

    function syncTrace() {
      const host = frameViewportRef.current?.querySelector<HTMLElement>(
        `[data-clipper-render-object-id="${cssEscape(object.id)}"]`,
      );
      const path =
        host
          ?.querySelector<HTMLElement>("[data-clipper-shadow-render-root]")
          ?.shadowRoot?.querySelector<SVGPathElement>("#draw-path") ?? null;
      if (path !== tracedPath) {
        restorePath();
        tracedPath = path;
        previousAttributes = path
          ? Object.fromEntries(
              Object.keys(traceAttributes).map((name) => [
                name,
                path.getAttribute(name),
              ]),
            )
          : null;
      }
      if (path) {
        for (const [name, value] of Object.entries(traceAttributes)) {
          path.setAttribute(name, value);
        }
      }
      frameId = requestAnimationFrame(syncTrace);
    }

    syncTrace();
    return () => {
      cancelAnimationFrame(frameId);
      restorePath();
    };
  }, [frameViewportRef, object.id]);

  return null;
}

function updateObjectPreviewBoundsCache(event: Event) {
  const detail = (event as CustomEvent<{ bounds?: Bounds; objectId?: string }>)
    .detail;
  if (!detail?.objectId || !detail.bounds) return null;
  objectPreviewBoundsById.set(detail.objectId, detail.bounds);
  return detail;
}

function clearObjectPreviewBoundsCache() {
  objectPreviewBoundsById.clear();
}

function getPreviewAdjustedPathPoint(
  point: Point,
  objectId: string | undefined,
  objectBounds: Bounds | undefined,
) {
  if (!objectId || !objectBounds) return point;
  const previewBounds = objectPreviewBoundsById.get(objectId);
  if (!previewBounds) return point;
  return {
    x:
      previewBounds.x +
      ((point.x - objectBounds.x) / Math.max(objectBounds.width, 1)) *
        previewBounds.width,
    y:
      previewBounds.y +
      ((point.y - objectBounds.y) / Math.max(objectBounds.height, 1)) *
        previewBounds.height,
  };
}

function getCurrentFramePortalOverlayTransform({
  cameraTransform,
  frameScale,
  frameViewportRef,
  portalHost,
}: {
  cameraTransform: CameraPreviewTransform;
  frameScale: number;
  frameViewportRef: RefObject<HTMLDivElement | null>;
  portalHost: HTMLElement;
}) {
  return readOverlayTransform({
    cameraTransform,
    frameScale,
    frameViewportRef,
    portalHost,
  });
}

function usePortalOverlayFrameSync(sync: () => void) {
  useLayoutEffect(() => {
    return startPortalSyncLoop(sync);
  }, [sync]);
}

function setPathPortalPointVars(
  element: HTMLElement,
  point: Point,
  cameraTransform: CameraPreviewTransform,
  frameScale: number,
  overlayTransform: FramePortalOverlayTransform,
) {
  const viewport = boundsToViewport(
    { x: point.x, y: point.y, width: 0, height: 0 },
    cameraTransform,
    frameScale,
  );
  const portal = viewportPointToPortal(viewport, overlayTransform);
  element.style.setProperty("--clipper-path-left", `${portal.x}px`);
  element.style.setProperty("--clipper-path-top", `${portal.y}px`);
  return portal;
}

function readPathPortalPoint(element: HTMLElement, prefix: "from" | "to" | "") {
  const x =
    prefix === ""
      ? Number(element.dataset.frameX)
      : Number(element.dataset[`frame${prefix === "from" ? "From" : "To"}X`]);
  const y =
    prefix === ""
      ? Number(element.dataset.frameY)
      : Number(element.dataset[`frame${prefix === "from" ? "From" : "To"}Y`]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function usePortalPathOverlaySync({
  cameraTransform,
  frameScale,
  frameViewportRef,
  objectBounds,
  objectId,
  portalHost,
  rootRef,
}: {
  cameraTransform: CameraPreviewTransform;
  frameScale: number;
  frameViewportRef: RefObject<HTMLDivElement | null>;
  objectBounds?: Bounds;
  objectId?: string;
  portalHost: HTMLElement;
  rootRef: RefObject<HTMLElement | null>;
}) {
  const syncPathOverlay = useCallback(() => {
    const root = rootRef.current;
    if (root) {
      const overlayTransform = getCurrentFramePortalOverlayTransform({
        cameraTransform,
        frameScale,
        frameViewportRef,
        portalHost,
      });
      for (const element of root.querySelectorAll<HTMLElement>(
        "[data-frame-path-point]",
      )) {
        const point = readPathPortalPoint(element, "");
        if (point) {
          setPathPortalPointVars(
            element,
            getPreviewAdjustedPathPoint(point, objectId, objectBounds),
            cameraTransform,
            frameScale,
            overlayTransform,
          );
        }
      }
      for (const element of root.querySelectorAll<HTMLElement>(
        "[data-frame-path-line]",
      )) {
        const from = readPathPortalPoint(element, "from");
        const to = readPathPortalPoint(element, "to");
        if (!from || !to) continue;
        const adjustedFrom = getPreviewAdjustedPathPoint(
          from,
          objectId,
          objectBounds,
        );
        const adjustedTo = getPreviewAdjustedPathPoint(
          to,
          objectId,
          objectBounds,
        );
        const portalFrom = setPathPortalPointVars(
          element,
          adjustedFrom,
          cameraTransform,
          frameScale,
          overlayTransform,
        );
        const portalTo = viewportPointToPortal(
          boundsToViewport(
            { x: adjustedTo.x, y: adjustedTo.y, width: 0, height: 0 },
            cameraTransform,
            frameScale,
          ),
          overlayTransform,
        );
        const dx = portalTo.x - portalFrom.x;
        const dy = portalTo.y - portalFrom.y;
        element.style.setProperty(
          "--clipper-path-line-width",
          `${Math.hypot(dx, dy)}px`,
        );
        element.style.setProperty(
          "--clipper-path-line-angle",
          `${(Math.atan2(dy, dx) * 180) / Math.PI}deg`,
        );
      }
    }
  }, [
    cameraTransform,
    frameScale,
    frameViewportRef,
    objectBounds,
    objectId,
    portalHost,
    rootRef,
  ]);
  usePortalOverlayFrameSync(syncPathOverlay);

  useEffect(() => {
    if (!objectId) return;
    function updatePreviewBounds(event: Event) {
      updateObjectPreviewBoundsCache(event);
    }
    window.addEventListener(
      "clipper:object-preview-bounds",
      updatePreviewBounds,
    );
    window.addEventListener(
      "clipper:number-input-scrub-end",
      clearObjectPreviewBoundsCache,
    );
    return () => {
      window.removeEventListener(
        "clipper:object-preview-bounds",
        updatePreviewBounds,
      );
      window.removeEventListener(
        "clipper:number-input-scrub-end",
        clearObjectPreviewBoundsCache,
      );
    };
  }, [objectId]);
}

function PathEditOverlay({
  cameraTransform,
  frameScale,
  frameViewportRef,
  object,
  onPathControlPointerDown,
  portalHost,
}: {
  cameraTransform: CameraPreviewTransform;
  frameScale: number;
  frameViewportRef: RefObject<HTMLDivElement | null>;
  object: FrameObject;
  onPathControlPointerDown: NonNullable<
    FramePreviewProps["onPathControlPointerDown"]
  >;
  portalHost: HTMLElement;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<
    number | null
  >(null);
  const [hoveredSegmentIndex, setHoveredSegmentIndex] = useState<number | null>(
    null,
  );
  const segments = parseEditablePath(object);
  usePortalPathOverlaySync({
    cameraTransform,
    frameScale,
    frameViewportRef,
    objectBounds: object.bounds,
    objectId: object.id,
    portalHost,
    rootRef,
  });
  useEffect(() => {
    setEditing(false);
    setSelectedSegmentIndex(null);
    setHoveredSegmentIndex(null);
  }, [object.id]);
  if (!segments?.length) return null;
  const handleLines = segments.flatMap((segment, index) => [
    ...(editing &&
    selectedSegmentIndex === index &&
    segment.kind === "curve" &&
    segment.c1
      ? [
          {
            key: `${object.id}:${index}:c1-line`,
            from: segment.start,
            to: segment.c1,
          },
        ]
      : []),
    ...(editing &&
    selectedSegmentIndex === index &&
    segment.kind === "curve" &&
    segment.c2
      ? [
          {
            key: `${object.id}:${index}:c2-line`,
            from: segment.end,
            to: segment.c2,
          },
        ]
      : []),
  ]);
  const hoveredSegmentLines =
    hoveredSegmentIndex === null
      ? []
      : getEditableSegmentHitLines(
          segments[hoveredSegmentIndex],
          hoveredSegmentIndex,
        );
  const controls = segments.flatMap((segment, index) => [
    ...(editing && index === 0
      ? [
          {
            control: "start" as const,
            point: segment.start,
            segmentIndex: index,
          },
        ]
      : []),
    ...(editing &&
    selectedSegmentIndex === index &&
    segment.kind === "curve" &&
    segment.c1
      ? [{ control: "c1" as const, point: segment.c1, segmentIndex: index }]
      : []),
    ...(editing &&
    selectedSegmentIndex === index &&
    segment.kind === "curve" &&
    segment.c2
      ? [{ control: "c2" as const, point: segment.c2, segmentIndex: index }]
      : []),
    ...(editing
      ? [{ control: "end" as const, point: segment.end, segmentIndex: index }]
      : []),
  ]);
  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0"
      data-frame-path-edit-overlay={object.id}
      style={{
        transform:
          "translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px))",
        zIndex: 2147483646,
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setEditing(true);
        setSelectedSegmentIndex(null);
      }}
    >
      {hoveredSegmentLines.map((line) => (
        <div
          key={`${object.id}:${line.key}:segment-hover`}
          data-frame-path-line
          data-frame-from-x={line.from.x}
          data-frame-from-y={line.from.y}
          data-frame-to-x={line.to.x}
          data-frame-to-y={line.to.y}
          className="pointer-events-none absolute border-t-2 border-[#159dff]"
          style={{
            left: "var(--clipper-path-left, 0px)",
            top: "var(--clipper-path-top, 0px)",
            width: "var(--clipper-path-line-width, 0px)",
            transform: "rotate(var(--clipper-path-line-angle, 0deg))",
            transformOrigin: "0 0",
            zIndex: 2147483646,
          }}
        />
      ))}
      {segments.flatMap(getEditableSegmentHitLines).map((line) => (
        <button
          key={`${object.id}:${line.key}:segment-hit`}
          type="button"
          aria-label={editing ? "Show Bezier handles" : "Show path points"}
          data-frame-path-line
          data-frame-from-x={line.from.x}
          data-frame-from-y={line.from.y}
          data-frame-to-x={line.to.x}
          data-frame-to-y={line.to.y}
          className="pointer-events-auto absolute cursor-pointer border-0 bg-transparent p-0"
          style={{
            left: "var(--clipper-path-left, 0px)",
            top: "calc(var(--clipper-path-top, 0px) - 16px)",
            width: "var(--clipper-path-line-width, 0px)",
            height: 32,
            transform: "rotate(var(--clipper-path-line-angle, 0deg))",
            transformOrigin: "0 50%",
            zIndex: 2147483645,
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            if (!editing) {
              setEditing(true);
              setSelectedSegmentIndex(null);
              return;
            }
            setSelectedSegmentIndex(line.segmentIndex);
          }}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setEditing(true);
            setSelectedSegmentIndex(null);
          }}
          onPointerEnter={() => setHoveredSegmentIndex(line.segmentIndex)}
          onPointerLeave={() => setHoveredSegmentIndex(null)}
        />
      ))}
      {handleLines.map((line) => {
        return (
          <div
            key={line.key}
            data-frame-path-line
            data-frame-from-x={line.from.x}
            data-frame-from-y={line.from.y}
            data-frame-to-x={line.to.x}
            data-frame-to-y={line.to.y}
            className="pointer-events-none absolute border-t border-dashed border-[#8fbff7]"
            style={{
              left: "var(--clipper-path-left, 0px)",
              top: "var(--clipper-path-top, 0px)",
              width: "var(--clipper-path-line-width, 0px)",
              transform: "rotate(var(--clipper-path-line-angle, 0deg))",
              transformOrigin: "0 0",
              zIndex: 2147483646,
            }}
          />
        );
      })}
      {controls.map(({ control, point, segmentIndex }, index) => {
        const isHandle = control === "c1" || control === "c2";
        return (
          <button
            type="button"
            key={`${object.id}:${index}:${control}`}
            data-frame-path-point
            data-frame-x={point.x}
            data-frame-y={point.y}
            className={`pointer-events-auto absolute grid -translate-x-1/2 -translate-y-1/2 cursor-pointer border-2 border-[#8fbff7] bg-[#159dff] outline-none transition ${isHandle ? "rounded-none" : "rounded-full"}`}
            style={{
              width: isHandle ? 7 : 9,
              height: isHandle ? 7 : 9,
              boxShadow: "inset 0 0 0 2px white",
              left: "var(--clipper-path-left, 0px)",
              top: "var(--clipper-path-top, 0px)",
              zIndex: 2147483647,
            }}
            title={
              isHandle
                ? "Drag Bezier handle"
                : "Drag path joint, click to delete"
            }
            onPointerDown={(event) => {
              event.stopPropagation();
              onPathControlPointerDown(event, object.id, segmentIndex, control);
            }}
          />
        );
      })}
    </div>
  );
}

function ShapeDrawPreviewControlsOverlay({
  cameraTransform,
  frameScale,
  frameViewportRef,
  preview,
  portalHost,
}: {
  cameraTransform: CameraPreviewTransform;
  frameScale: number;
  frameViewportRef: RefObject<HTMLDivElement | null>;
  preview: ShapeDrawPreview;
  portalHost: HTMLElement;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  usePortalPathOverlaySync({
    cameraTransform,
    frameScale,
    frameViewportRef,
    portalHost,
    rootRef,
  });
  const joints = preview.joints ?? [];
  const handles = preview.handles ?? [];
  if (joints.length === 0 && handles.length === 0) return null;

  return (
    <div ref={rootRef} className="pointer-events-none absolute inset-0">
      {handles.map((item, index) => {
        return (
          <Fragment key={`${index}:${item.anchor.x}:${item.anchor.y}`}>
            <div
              data-frame-path-line
              data-frame-from-x={item.anchor.x}
              data-frame-from-y={item.anchor.y}
              data-frame-to-x={item.handle.x}
              data-frame-to-y={item.handle.y}
              className="pointer-events-none absolute border-t border-dashed border-[#8fbff7]"
              style={{
                left: "var(--clipper-path-left, 0px)",
                top: "var(--clipper-path-top, 0px)",
                width: "var(--clipper-path-line-width, 0px)",
                transform: "rotate(var(--clipper-path-line-angle, 0deg))",
                transformOrigin: "0 0",
                zIndex: 2147483646,
              }}
            />
            <div
              data-frame-path-point
              data-frame-x={item.handle.x}
              data-frame-y={item.handle.y}
              className="pointer-events-none absolute h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 border border-[#8fbff7] bg-[#11141a]"
              style={{
                left: "var(--clipper-path-left, 0px)",
                top: "var(--clipper-path-top, 0px)",
                zIndex: 2147483647,
              }}
            />
          </Fragment>
        );
      })}
      {[...joints, ...handles.map((item) => item.anchor)].map(
        (point, index) => {
          return (
            <div
              key={`${index}:${point.x}:${point.y}`}
              data-frame-path-point
              data-frame-x={point.x}
              data-frame-y={point.y}
              className="pointer-events-none absolute h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-[#159dff]"
              style={{
                left: "var(--clipper-path-left, 0px)",
                top: "var(--clipper-path-top, 0px)",
                zIndex: 2147483647,
              }}
            />
          );
        },
      )}
    </div>
  );
}

function ShapeDrawPreviewOverlay({
  preview,
  frameScale,
  tool,
}: {
  preview: ShapeDrawPreview;
  frameScale: number;
  tool: ComposeDrawTool;
}) {
  const { bounds } = preview;
  const style = {
    left: bounds.x * frameScale,
    top: bounds.y * frameScale,
    width: bounds.width * frameScale,
    height: bounds.height * frameScale,
  } as CSSProperties;

  if (
    tool === "line" ||
    tool === "arrow" ||
    tool === "pen" ||
    tool === "pencil" ||
    tool === "textPath"
  ) {
    const pointToLocal = (point: Point) => ({
      x: point.x - bounds.x,
      y: point.y - bounds.y,
    });
    const start = pointToLocal(preview.start);
    const end = pointToLocal(preview.end);
    const path =
      preview.path ??
      (tool === "pencil"
        ? (preview.points?.length
            ? preview.points
            : [preview.start, preview.end]
          )
            .map((point, index) => {
              const local = pointToLocal(point);
              return `${index === 0 ? "M" : "L"} ${local.x.toFixed(2)} ${local.y.toFixed(2)}`;
            })
            .join(" ")
        : tool === "pen" || tool === "textPath"
          ? `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} C ${((start.x + end.x) / 2).toFixed(2)} ${start.y.toFixed(2)}, ${((start.x + end.x) / 2).toFixed(2)} ${end.y.toFixed(2)}, ${end.x.toFixed(2)} ${end.y.toFixed(2)}`
          : `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} L ${end.x.toFixed(2)} ${end.y.toFixed(2)}`);
    return (
      <svg
        className="pointer-events-none absolute z-50 overflow-visible"
        style={style}
        viewBox={`0 0 ${Math.max(1, bounds.width)} ${Math.max(1, bounds.height)}`}
        preserveAspectRatio="none"
      >
        <defs>
          <marker
            id="clipper-draw-preview-arrow"
            markerHeight="7"
            markerWidth="7"
            orient="auto"
            refX="6"
            refY="3.5"
          >
            <path d="M0,0 L7,3.5 L0,7 Z" fill="#D5D5D5" />
          </marker>
        </defs>
        <path
          d={path}
          fill="none"
          id="clipper-draw-preview-path"
          markerEnd={
            tool === "arrow" ? "url(#clipper-draw-preview-arrow)" : undefined
          }
          stroke="#D5D5D5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={tool === "pencil" ? 4 : 3}
          vectorEffect="non-scaling-stroke"
        />
        {tool === "textPath" ? (
          <text
            fill="#ffffff"
            fontFamily="system-ui, sans-serif"
            fontSize="48"
            fontWeight="500"
          >
            <textPath
              href="#clipper-draw-preview-path"
              startOffset="50%"
              textAnchor="middle"
            >
              Text on path
            </textPath>
          </text>
        ) : null}
      </svg>
    );
  }

  if (tool === "null") {
    return (
      <div
        className="pointer-events-none absolute z-50"
        style={style}
        aria-hidden
      >
        <div className="absolute inset-0 border-2 border-[#ff3b30]" />
        <div className="absolute left-1/2 top-1/2 h-[52%] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff3b30]" />
        <div className="absolute left-1/2 top-1/2 h-[2px] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff3b30]" />
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute z-50 bg-[#D5D5D5]/80"
      style={{
        ...style,
        borderRadius: tool === "ellipse" ? "9999px" : undefined,
        clipPath:
          tool === "polygon"
            ? "polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)"
            : tool === "star"
              ? "polygon(50% 0%, 61% 35%, 98% 35%, 68% 56%, 79% 91%, 50% 70%, 21% 91%, 32% 56%, 2% 35%, 39% 35%)"
              : undefined,
      }}
    />
  );
}

export const FrameObjectView = memo(function FrameObjectView({
  activeShapeTool,
  animationsEnabled,
  exportTileFrameBounds,
  object,
  parentTransform,
  canSelect,
  duration,
  editing,
  focusPicking,
  frameScale,
  isPlaying,
  liveCodeObjectTime,
  previewTime,
  liveTimeOffset,
  renderMode,
  onDoubleClick,
  onContextMenu,
  onPointerDown,
  onTextEditCommit,
  onTextEditEnd,
  compositionLibrary = [],
  compositionAncestors = [],
  onSubcompositionDoubleClick,
}: {
  activeShapeTool?: ComposeDrawTool | null;
  animationsEnabled: boolean;
  exportTileFrameBounds?: ExportTileFrameBounds;
  object: FrameObject;
  parentTransform?: string;
  canSelect: boolean;
  duration: number;
  editing: boolean;
  focusPicking: boolean;
  frameScale: number;
  isPlaying: boolean;
  liveCodeObjectTime?: boolean;
  previewTime: number;
  liveTimeOffset?: number;
  renderMode: "preview" | "export";
  onDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onTextEditCommit: (
    content: string,
    richText?: RichTextSegment[],
    bounds?: Bounds,
  ) => void;
  onTextEditEnd?: () => void;
  compositionLibrary?: Part[];
  compositionAncestors?: readonly string[];
  onSubcompositionDoubleClick?: (
    compositionId: string,
    sourceObjectId?: string | null,
  ) => void;
}) {
  const evaluatedObject = useMemo(
    () =>
      evaluateObjectForPreview(
        object,
        previewTime,
        duration,
        animationsEnabled,
      ),
    [animationsEnabled, duration, object, previewTime],
  );
  const animation = {
    style: evaluatedObject.renderStyle,
    content: evaluatedObject.renderContent,
  };
  const evaluatedBounds = evaluatedObject.bounds;
  const objectRef = useRef<HTMLDivElement | null>(null);
  const editableRef = useRef<HTMLDivElement | null>(null);
  const lastCommittedTextRef = useRef<string | null>(null);
  const editingObjectIdRef = useRef<string | null>(null);
  const objectTransform =
    typeof object.style.transform === "string"
      ? object.style.transform
      : undefined;
  const animationTransform =
    typeof animation.style.transform === "string"
      ? animation.style.transform
      : undefined;
  const animationWidth =
    typeof animation.style.width === "number" ||
    typeof animation.style.width === "string"
      ? animation.style.width
      : undefined;
  const animationHeight =
    typeof animation.style.height === "number" ||
    typeof animation.style.height === "string"
      ? animation.style.height
      : undefined;
  const verticalAlign =
    object.type === "text"
      ? String(object.style.verticalAlign ?? "middle")
      : "middle";
  const textBoxLayout =
    object.type === "text"
      ? String(object.style.textBoxLayout ?? "fixed")
      : "fixed";
  const textWrapClass =
    textBoxLayout === "overflow" ? "whitespace-pre" : "whitespace-pre-wrap";
  const hasActiveShadow = hasVisibleShadow(evaluatedObject.shadow);
  const shouldClipTextToBounds =
    object.type === "text" && textBoxLayout === "fixed" && !hasActiveShadow;
  const style = {
    ...evaluatedObject.style,
    ...animation.style,
    left:
      renderMode === "export"
        ? evaluatedBounds.x
        : `var(--clipper-resize-left, ${evaluatedBounds.x}px)`,
    top:
      renderMode === "export"
        ? evaluatedBounds.y
        : `var(--clipper-resize-top, ${evaluatedBounds.y}px)`,
    width:
      renderMode === "export"
        ? (animationWidth ?? evaluatedBounds.width)
        : `var(--clipper-resize-width, ${formatStyleLength(
            animationWidth ?? evaluatedBounds.width,
          )})`,
    height:
      textBoxLayout === "auto-height"
        ? "auto"
        : renderMode === "export"
          ? (animationHeight ?? evaluatedBounds.height)
          : `var(--clipper-resize-height, ${formatStyleLength(
              animationHeight ?? evaluatedBounds.height,
            )})`,
    minHeight:
      textBoxLayout === "auto-height" ? evaluatedBounds.height : undefined,
    fontSize:
      object.type === "text" && renderMode !== "export"
        ? `calc(${formatStyleLength(evaluatedObject.style.fontSize)} * var(--clipper-scale-preview, 1))`
        : evaluatedObject.style.fontSize,
    borderWidth:
      renderMode !== "export" && object.style.borderWidth
        ? `calc(${formatStyleLength(object.style.borderWidth)} * var(--clipper-scale-preview, 1))`
        : object.style.borderWidth,
    strokeWidth:
      renderMode !== "export" && object.style.strokeWidth
        ? `calc(${formatStyleLength(object.style.strokeWidth)} * var(--clipper-scale-preview, 1))`
        : object.style.strokeWidth,
    borderRadius:
      renderMode === "export"
        ? object.style.borderRadius
        : `var(--clipper-radius-preview, ${formatStyleLength(object.style.borderRadius)})`,
    transform:
      renderMode === "export"
        ? `${parentTransform ?? ""} ${animationTransform ?? ""} ${objectTransform ?? ""}`.trim()
        : `${parentTransform ?? ""} translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px)) ${animationTransform ?? ""} ${objectTransform ?? ""}`.trim(),
    justifyContent:
      verticalAlign === "top"
        ? "flex-start"
        : verticalAlign === "bottom"
          ? "flex-end"
          : "center",
    willChange: renderMode === "export" ? undefined : "transform",
  } as CSSProperties;
  const content = animation.content ?? object.content;
  const richText = evaluatedObject.renderRichText;
  const textSegments = useMemo(
    () => getRenderableTextSegments(content ?? "", richText),
    [content, richText],
  );
  const splitTextAnimations =
    animationsEnabled && object.type === "text"
      ? (object.animations?.filter(
          (item) => item.enabled !== false && item.options.split,
        ) ?? [])
      : [];
  const splitTextTime = useAdjustedSceneTime(
    splitTextAnimations.length > 0 && renderMode !== "export",
    previewTime,
    liveTimeOffset ?? 0,
  );
  const editableTextPath = isEditableTextPathObject(object);
  const editableContent = editableTextPath
    ? getTextPathEditableContent(object.content)
    : (object.content ?? "");
  useLayoutEffect(() => {
    const element = objectRef.current;
    if (!element || renderMode === "export") return;
    element.style.removeProperty("--clipper-drag-x");
    element.style.removeProperty("--clipper-drag-y");
    element.style.removeProperty("--clipper-resize-left");
    element.style.removeProperty("--clipper-resize-top");
    element.style.removeProperty("--clipper-resize-width");
    element.style.removeProperty("--clipper-resize-height");
    element.style.removeProperty("--clipper-scale-preview");
  }, [
    evaluatedBounds.height,
    evaluatedBounds.width,
    evaluatedBounds.x,
    evaluatedBounds.y,
    renderMode,
  ]);

  useEffect(() => {
    if (!editing || !editableRef.current) {
      editingObjectIdRef.current = null;
      return;
    }
    if (editingObjectIdRef.current === object.id) return;
    const currentCommittedText = JSON.stringify({
      content: editableContent,
      richText: editableTextPath ? undefined : object.richText,
    });

    const editable = editableRef.current;
    editable.replaceChildren(
      ...textSegmentsToEditableNodes(
        getRenderableTextSegments(
          editableContent,
          editableTextPath ? undefined : object.richText,
        ),
        !editableTextPath && Boolean(object.richText),
      ),
    );
    lastCommittedTextRef.current = currentCommittedText;
    editingObjectIdRef.current = object.id;
    editable.focus();
    const selection = window.getSelection();
    const clickPoint = pendingTextEditClick;
    pendingTextEditClick = null;
    if (clickPoint) {
      const range = document.caretRangeFromPoint(
        clickPoint.clientX,
        clickPoint.clientY,
      );
      if (range && editable.contains(range.startContainer)) {
        selection?.removeAllRanges();
        selection?.addRange(range);
      } else {
        const fallback = document.createRange();
        fallback.selectNodeContents(editable);
        fallback.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(fallback);
      }
    } else {
      const range = document.createRange();
      range.selectNodeContents(editable);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [editableContent, editableTextPath, editing, object.id, object.richText]);

  useEffect(() => {
    if (!editing) return;

    function commitBeforeAppPointerHandling(event: globalThis.PointerEvent) {
      const editable = editableRef.current;
      if (!editable || editable.contains(event.target as Node)) return;
      commitTextEdit();
    }

    window.addEventListener(
      "pointerdown",
      commitBeforeAppPointerHandling,
      true,
    );
    return () =>
      window.removeEventListener(
        "pointerdown",
        commitBeforeAppPointerHandling,
        true,
      );
  }, [editing, object.style]);

  function commitTextEdit() {
    if (!editableRef.current) return;
    normalizeEditableFormatting(editableRef.current);
    const richText = richTextSegmentsFromElement(
      editableRef.current,
      object.style,
    );
    const content = richText.map((segment) => segment.text).join("");
    const nextRichText =
      !editableTextPath && shouldPersistRichText(richText, object.style)
        ? richText
        : undefined;
    const nextCommittedText = JSON.stringify({
      content,
      richText: nextRichText,
    });
    const nextBounds =
      !editableTextPath && textBoxLayout === "auto-height"
        ? getAutoHeightTextBounds(object, editableRef.current)
        : undefined;
    if (nextCommittedText === lastCommittedTextRef.current && !nextBounds)
      return;
    lastCommittedTextRef.current = nextCommittedText;
    onTextEditCommit(content, nextRichText, nextBounds);
  }

  function finishTextEdit() {
    commitTextEdit();
    onTextEditEnd?.();
  }

  function onTextEditKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      finishTextEdit();
      editableRef.current?.blur();
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      const key = event.key.toLowerCase();
      if (key === "b" || key === "i" || key === "u") {
        event.preventDefault();
        toggleEditableSelectionFormat(
          key === "b" ? "bold" : key === "i" ? "italic" : "underline",
        );
        return;
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      finishTextEdit();
      const editable = editableRef.current;
      const selection = window.getSelection();
      if (
        editable &&
        selection?.rangeCount &&
        editable.contains(selection.getRangeAt(0).commonAncestorContainer)
      )
        selection.removeAllRanges();
      editable?.blur();
    }
  }

  function toggleEditableSelectionFormat(
    format: "bold" | "italic" | "underline",
  ) {
    if (!editableRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
      return;
    const range = selection.getRangeAt(0);
    if (!editableRef.current.contains(range.commonAncestorContainer)) return;

    const current = getSelectionFormatState(selection, format);
    const span = document.createElement("span");
    if (format === "bold") span.style.fontWeight = current ? "400" : "700";
    if (format === "italic")
      span.style.fontStyle = current ? "normal" : "italic";
    if (format === "underline")
      span.style.textDecorationLine = current ? "none" : "underline";
    span.appendChild(range.extractContents());
    range.insertNode(span);

    selection.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    selection.addRange(nextRange);
  }

  const isLocked = Boolean(object.locked);
  const isNullObject = object.type === "null";
  const codeObjectTime =
    liveTimeOffset !== undefined || liveCodeObjectTime === false
      ? previewTime
      : undefined;

  if (isNullObject && renderMode === "export") return null;

  const textContent = splitTextAnimations.length
    ? renderSplitTextSegments(
        textSegments,
        Boolean(richText),
        splitTextAnimations,
        splitTextTime,
      )
    : renderRichTextSegments(textSegments, Boolean(richText));

  return (
    <div
      ref={objectRef}
      className={`absolute flex touch-none select-none flex-col whitespace-pre-line ${shouldClipTextToBounds ? "overflow-hidden" : "overflow-visible"} ${focusPicking ? "cursor-crosshair" : (object.type === "text" || editableTextPath) && (activeShapeTool === "text" || activeShapeTool === "textPath") ? "cursor-text" : "cursor-default"} ${editing ? "select-text" : ""} ${!editing && (activeShapeTool === "text" || activeShapeTool === "textPath") && (object.type === "text" || editableTextPath) ? "hover:ring-2 hover:ring-[#159dff]/60 rounded-sm" : ""}`}
      data-clipper-render-object-id={object.id}
      data-object-id={canSelect && !isLocked ? object.id : undefined}
      style={{
        ...style,
        ...(isLocked ? { pointerEvents: "none" as const } : {}),
      }}
      onDoubleClick={(event) => {
        if (!isLocked) onDoubleClick(event);
      }}
      onContextMenu={(event) => {
        if (!isLocked) onContextMenu?.(event);
      }}
      onPointerDown={(event) => {
        if (
          !isLocked &&
          activeShapeTool !== "pen" &&
          activeShapeTool !== "pencil" &&
          activeShapeTool !== "textPath"
        )
          onPointerDown(event);
      }}
    >
      {!parseEditablePath(object) ? (
        <StrokeOverlay
          object={object}
          liveScrubClock={isPlaying}
          fallbackTime={previewTime}
          liveTimeOffset={liveTimeOffset ?? 0}
        />
      ) : null}
      {(object.type === "text" || editableTextPath) && editing ? (
        <div
          ref={editableRef}
          className={`min-h-0 w-full outline-none ${
            editableTextPath
              ? "rounded-[6px] bg-[#11141a]/80 px-2 py-1 text-center ring-2 ring-[#159dff]"
              : textWrapClass
          } ${
            !editableTextPath && textBoxLayout === "fixed" && !hasActiveShadow
              ? "max-w-full max-h-full overflow-hidden"
              : ""
          }`}
          contentEditable
          suppressContentEditableWarning
          onBlur={finishTextEdit}
          onInput={editableTextPath ? () => commitTextEdit() : undefined}
          onKeyDown={onTextEditKeyDown}
          onPointerDown={(event) => event.stopPropagation()}
          style={
            editableTextPath
              ? {
                  color: "#ffffff",
                  fontSize: `calc(48px * var(--clipper-scale-preview, 1))`,
                  fontWeight: 600,
                  lineHeight: 1.1,
                }
              : undefined
          }
        />
      ) : null}
      {object.type === "text" && !editing ? (
        <div
          className={`min-h-0 w-full ${shouldClipTextToBounds ? "max-h-full overflow-hidden" : ""} ${textWrapClass}`}
        >
          {textContent}
        </div>
      ) : null}
      {object.type === "svg" && content && !(editableTextPath && editing) ? (
        <ExportSvgContent
          bounds={evaluatedBounds}
          content={content}
          exportTileFrameBounds={exportTileFrameBounds}
          frameScale={frameScale}
          markupKind="svg"
          owner={{
            id: object.id,
            name: object.name,
            type: object.type,
            layer: "object",
          }}
          renderMode={renderMode}
          style={style}
        />
      ) : null}
      {object.type === "image" || object.type === "media" ? (
        <MediaContent
          isPlaying={isPlaying}
          object={evaluatedObject}
          previewTime={previewTime}
        />
      ) : null}
      {object.type === "pattern2d" ? (
        <Pattern2DContent object={evaluatedObject} />
      ) : null}
      {object.type === "code" ? (
        <CodeObjectFrame
          liveTimeEnabled={liveCodeObjectTime ?? true}
          liveTimeOffset={liveTimeOffset ?? 0}
          object={evaluatedObject}
          time={codeObjectTime}
        />
      ) : null}
      {object.type === "composition" ? (
        <SubcompositionContent
          bounds={evaluatedBounds}
          compositionAncestors={compositionAncestors}
          compositionLibrary={compositionLibrary}
          frameScale={frameScale}
          isPlaying={isPlaying}
          object={evaluatedObject}
          previewTime={previewTime}
          renderMode={renderMode}
          onSubcompositionDoubleClick={onSubcompositionDoubleClick}
        />
      ) : null}
      {(object.type === "html" ||
        object.type === "template" ||
        object.type === "custom-renderer") &&
      content ? (
        <HtmlContent
          content={content}
          props={
            object.type === "custom-renderer"
              ? evaluatedObject.props
              : undefined
          }
        />
      ) : null}
      {object.type !== "text" &&
      object.type !== "null" &&
      object.type !== "svg" &&
      object.type !== "html" &&
      object.type !== "image" &&
      object.type !== "media" &&
      object.type !== "template" &&
      object.type !== "custom-renderer" &&
      object.type !== "pattern2d" &&
      object.type !== "composition" &&
      object.type !== "code" &&
      content
        ? content
        : null}
      {isNullObject && renderMode !== "export" ? (
        <div className="pointer-events-auto absolute inset-0 cursor-pointer">
          <div className="absolute inset-0 border-2 border-[#ff3b30]" />
          <div className="absolute left-1/2 top-1/2 h-[52%] w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff3b30]" />
          <div className="absolute left-1/2 top-1/2 h-[2px] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff3b30]" />
        </div>
      ) : null}
    </div>
  );
}, areFrameObjectPropsEqual);

type SplitTextToken = {
  key: string;
  text: string;
  animated: boolean;
  style: CSSProperties;
  segmentIndex: number;
  lineIndex: number;
  wordIndex: number;
};

function renderSplitTextSegments(
  segments: RichTextSegment[],
  explicitFormatting: boolean,
  animations: NonNullable<FrameObject["animations"]>,
  time: number,
) {
  const mode = animations[0]?.options.split?.mode ?? "word";
  const tokens = tokenizeTextSegments(segments, explicitFormatting, mode);
  const animatedTokens = tokens.filter((token) => token.animated);
  const animatedCount = animatedTokens.length;
  const orderMap = buildOrderMap(animations, animatedCount);

  let animatedIndex = 0;
  return tokens.map((token) => {
    if (token.text === "\n") return <br key={token.key} />;
    if (!token.animated)
      return (
        <span key={token.key} style={token.style}>
          {token.text}
        </span>
      );
    const tokenStyle = getSplitTextTokenStyle(
      animations,
      time,
      animatedIndex,
      animatedCount,
      orderMap,
      token,
    );
    animatedIndex += 1;
    return (
      <span
        key={token.key}
        style={{
          ...token.style,
          ...tokenStyle,
          display: "inline-block",
          whiteSpace: "pre",
        }}
      >
        {token.text}
      </span>
    );
  });
}

function SubcompositionContent({
  bounds,
  compositionAncestors,
  compositionLibrary,
  frameScale,
  isPlaying,
  object,
  previewTime,
  renderMode,
  onSubcompositionDoubleClick,
}: {
  bounds: Bounds;
  compositionAncestors: readonly string[];
  compositionLibrary: Part[];
  frameScale: number;
  isPlaying: boolean;
  object: FrameObject;
  previewTime: number;
  renderMode: "preview" | "export";
  onSubcompositionDoubleClick?: (
    compositionId: string,
    sourceObjectId?: string | null,
  ) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const compositionId = readSubcompositionId(object);
  const part = compositionLibrary.find(
    (item) => item.id === compositionId || item.compositionId === compositionId,
  );
  if (!compositionId || !part) {
    return <SubcompositionPlaceholder label="Missing composition" />;
  }
  const canonicalId = part.compositionId ?? part.id;
  if (compositionAncestors.includes(canonicalId)) {
    return <SubcompositionPlaceholder label="Composition cycle" />;
  }
  const localTime = clamp(previewTime, 0, part.duration);
  return (
    <div
      className="absolute inset-0 overflow-hidden bg-black"
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSubcompositionDoubleClick?.(canonicalId, object.id);
      }}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: FRAME_WIDTH,
          height: FRAME_HEIGHT,
          transform: `scale(${bounds.width / FRAME_WIDTH}, ${bounds.height / FRAME_HEIGHT})`,
        }}
      >
        <DomBackend
          active={false}
          activeShapeTool={null}
          animationsEnabled={true}
          canSelect={false}
          compositionAncestors={[...compositionAncestors, canonicalId]}
          compositionLibrary={compositionLibrary}
          duration={part.duration}
          editingTextObjectId={null}
          exportTileFrameBounds={undefined}
          focusPicking={false}
          frameScale={frameScale}
          hideNullObjects={true}
          hostRef={hostRef}
          isPlaying={isPlaying}
          localTime={localTime}
          part={part}
          renderClockSceneTime={localTime}
          renderMode={renderMode}
          onObjectPointerDown={noopObjectPointerDownForSubcomposition}
          onTextEditCommit={noopTextCommitForSubcomposition}
          onTextObjectDoubleClick={noopObjectDoubleClickForSubcomposition}
          onSubcompositionDoubleClick={onSubcompositionDoubleClick}
        />
      </div>
    </div>
  );
}

function readSubcompositionId(object: FrameObject) {
  const value = object.props?.compositionId;
  return typeof value === "string" ? value : "";
}

function SubcompositionPlaceholder({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#11141a] text-[22px] font-bold text-[#8f98a8]">
      {label}
    </div>
  );
}

const noopObjectPointerDownForSubcomposition = () => {};
const noopTextCommitForSubcomposition = () => {};
const noopObjectDoubleClickForSubcomposition = () => {};

function tokenizeTextSegments(
  segments: RichTextSegment[],
  explicitFormatting: boolean,
  mode: "word" | "character" | "line",
) {
  const tokens: SplitTextToken[] = [];
  let lineIndex = 0;
  let wordIndex = 0;
  segments.forEach((segment, segmentIndex) => {
    const style = textSegmentInlineStyle(segment, explicitFormatting);
    if (mode === "character") {
      Array.from(segment.text).forEach((char, charIndex) => {
        if (char === "\n") {
          tokens.push({
            key: `${segmentIndex}:char:${charIndex}`,
            text: "\n",
            animated: false,
            style,
            segmentIndex,
            lineIndex,
            wordIndex,
          });
          lineIndex += 1;
          wordIndex = 0;
          return;
        }
        const isSpace = /\s/.test(char);
        if (isSpace) wordIndex += 1;
        tokens.push({
          key: `${segmentIndex}:char:${charIndex}`,
          text: char,
          animated: !isSpace,
          style,
          segmentIndex,
          lineIndex,
          wordIndex,
        });
      });
      return;
    }
    const parts = segment.text.match(/\n|\s+|\S+/g) ?? [];
    parts.forEach((part, partIndex) => {
      if (part === "\n") {
        tokens.push({
          key: `${segmentIndex}:part:${partIndex}`,
          text: "\n",
          animated: false,
          style,
          segmentIndex,
          lineIndex,
          wordIndex,
        });
        lineIndex += 1;
        wordIndex = 0;
        return;
      }
      const isWhitespace = /^\s+$/.test(part);
      const animated = mode === "line" ? false : !isWhitespace;
      tokens.push({
        key: `${segmentIndex}:part:${partIndex}`,
        text: part,
        animated,
        style,
        segmentIndex,
        lineIndex,
        wordIndex,
      });
      if (!isWhitespace) wordIndex += 1;
    });
  });
  if (mode === "line") {
    return promoteLineTokens(tokens);
  }
  return tokens;
}

function promoteLineTokens(tokens: SplitTextToken[]): SplitTextToken[] {
  const result: SplitTextToken[] = [];
  let buffer: SplitTextToken[] = [];
  const flush = () => {
    if (buffer.length === 0) return;
    const first = buffer[0];
    const text = buffer.map((t) => t.text).join("");
    const animated = text.trim().length > 0;
    result.push({
      key: `line:${first.lineIndex}:${first.segmentIndex}`,
      text,
      animated,
      style: first.style,
      segmentIndex: first.segmentIndex,
      lineIndex: first.lineIndex,
      wordIndex: first.wordIndex,
    });
    buffer = [];
  };
  for (const token of tokens) {
    if (token.text === "\n") {
      flush();
      result.push(token);
    } else {
      buffer.push(token);
    }
  }
  flush();
  return result;
}

function buildOrderMap(
  animations: NonNullable<FrameObject["animations"]>,
  count: number,
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (const animation of animations) {
    const split = animation.options.split;
    if (!split) continue;
    const order = split.order ?? "forward";
    if (order !== "random") continue;
    const key = `${animation.id}:${split.seed ?? 0}:${count}`;
    if (map.has(key)) continue;
    map.set(key, shuffledOrder(count, split.seed ?? 0));
  }
  return map;
}

function shuffledOrder(count: number, seed: number): number[] {
  const indexes = Array.from({ length: count }, (_, i) => i);
  const rand = mulberry32(seed >>> 0 || 1);
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  const orderIndex = new Array<number>(count);
  for (let position = 0; position < count; position += 1) {
    orderIndex[indexes[position]] = position;
  }
  return orderIndex;
}

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function textSegmentInlineStyle(
  segment: RichTextSegment,
  explicitFormatting: boolean,
): CSSProperties {
  return {
    fontWeight: segment.bold ? 700 : explicitFormatting ? 400 : undefined,
    fontStyle: segment.italic
      ? "italic"
      : explicitFormatting
        ? "normal"
        : undefined,
    textDecorationLine: segment.underline
      ? "underline"
      : explicitFormatting
        ? "none"
        : undefined,
  };
}

function getSplitTextTokenStyle(
  animations: NonNullable<FrameObject["animations"]>,
  time: number,
  index: number,
  count: number,
  orderMap: Map<string, number[]>,
  token: SplitTextToken,
) {
  const combined: CSSProperties = {};
  for (const animation of animations) {
    const split = animation.options.split;
    if (!split) continue;
    if (split.tokenIndexes && !split.tokenIndexes.includes(index)) continue;
    const orderKey = `${animation.id}:${split.seed ?? 0}:${count}`;
    const orderIndex = getSplitTokenOrderIndex(
      index,
      count,
      split.order ?? "forward",
      orderMap.get(orderKey),
    );
    const tokenOffset =
      split.tokenDelays?.[index] ?? orderIndex * (split.stagger ?? 0);
    const tokenTime =
      split.repeatScope === "item"
        ? time - tokenOffset
        : getSequenceRepeatTokenTime(animation, time, tokenOffset, count);
    const beforeStart = tokenTime < (animation.options.delay ?? 0);
    const effectiveTime = beforeStart
      ? (animation.options.delay ?? 0)
      : tokenTime;
    const amount = computeSelectorAmount(split, index, count);
    const style =
      amount >= 0.999
        ? evaluateLayerAnimation(
            split.repeatScope === "item"
              ? animation
              : {
                  ...animation,
                  options: {
                    ...animation.options,
                    repeat: undefined,
                    repeatDelay: undefined,
                  },
                },
            effectiveTime,
          )
        : evaluateLayerAnimationWithAmount(
            animation,
            effectiveTime,
            amount,
            split.repeatScope !== "item",
          );
    for (const key in style) {
      const styleRecord = style as Record<string, unknown>;
      const value = styleRecord[key];
      if (
        key === "transform" &&
        combined.transform &&
        typeof value === "string"
      )
        combined.transform = `${combined.transform} ${value}`;
      else if (value !== undefined)
        (combined as Record<string, unknown>)[key] = value;
    }
    const origin = getSplitAnchorOrigin(split.anchor, token);
    if (origin) combined.transformOrigin = origin;
  }
  return combined;
}

function evaluateLayerAnimationWithAmount(
  animation: NonNullable<FrameObject["animations"]>[number],
  time: number,
  amount: number,
  stripRepeat: boolean,
): CSSProperties {
  const base = evaluateLayerAnimation(
    stripRepeat
      ? {
          ...animation,
          options: {
            ...animation.options,
            repeat: undefined,
            repeatDelay: undefined,
          },
        }
      : animation,
    time,
  );
  const settled = evaluateLayerAnimation(
    stripRepeat
      ? {
          ...animation,
          options: {
            ...animation.options,
            repeat: undefined,
            repeatDelay: undefined,
          },
        }
      : animation,
    (animation.options.delay ?? 0) + animation.options.duration + 1e9,
  );
  return blendRenderStyleByAmount(base, settled, amount);
}

function blendRenderStyleByAmount(
  active: CSSProperties,
  settled: CSSProperties,
  amount: number,
): CSSProperties {
  const out: CSSProperties = {};
  const keys = new Set<string>([
    ...Object.keys(active),
    ...Object.keys(settled),
  ]);
  for (const key of keys) {
    const activeValue = (active as Record<string, unknown>)[key];
    const settledValue = (settled as Record<string, unknown>)[key];
    if (key === "transform") {
      const a = typeof activeValue === "string" ? activeValue : "";
      const s = typeof settledValue === "string" ? settledValue : "";
      const blended = blendTransformStrings(a, s, amount);
      if (blended) (out as Record<string, unknown>)[key] = blended;
      continue;
    }
    if (typeof activeValue === "number" && typeof settledValue === "number") {
      (out as Record<string, unknown>)[key] =
        settledValue + (activeValue - settledValue) * amount;
    } else if (activeValue !== undefined) {
      (out as Record<string, unknown>)[key] = activeValue;
    } else if (settledValue !== undefined) {
      (out as Record<string, unknown>)[key] = settledValue;
    }
  }
  return out;
}

const TRANSFORM_FN_RE = /(\w+)\(([^)]+)\)/g;

function blendTransformStrings(
  active: string,
  settled: string,
  amount: number,
) {
  if (!active && !settled) return "";
  if (!active) return settled;
  if (!settled) return active;
  const activeMap = parseTransformString(active);
  const settledMap = parseTransformString(settled);
  const order: string[] = [];
  for (const fn of activeMap.keys()) order.push(fn);
  for (const fn of settledMap.keys()) if (!order.includes(fn)) order.push(fn);
  const parts: string[] = [];
  for (const fn of order) {
    const activeArgs = activeMap.get(fn);
    const settledArgs =
      settledMap.get(fn) ?? identityTransformArgs(fn, activeArgs?.length ?? 1);
    const baseArgs =
      activeArgs ?? identityTransformArgs(fn, settledArgs.length);
    const blended = baseArgs.map((arg, index) =>
      blendTransformArg(arg, settledArgs[index] ?? arg, amount),
    );
    parts.push(`${fn}(${blended.join(", ")})`);
  }
  return parts.join(" ");
}

function parseTransformString(value: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  TRANSFORM_FN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TRANSFORM_FN_RE.exec(value)) !== null) {
    const fn = match[1];
    const args = match[2].split(",").map((part) => part.trim());
    out.set(fn, args);
  }
  return out;
}

function identityTransformArgs(fn: string, length: number): string[] {
  const identity =
    fn === "scale" || fn === "scaleX" || fn === "scaleY"
      ? "1"
      : fn === "perspective"
        ? "1000px"
        : fn === "rotate" ||
            fn === "rotateX" ||
            fn === "rotateY" ||
            fn === "rotateZ" ||
            fn === "skewX" ||
            fn === "skewY"
          ? "0deg"
          : "0px";
  return Array.from({ length }, () => identity);
}

function blendTransformArg(active: string, settled: string, amount: number) {
  const activeNumber = parseFloat(active);
  const settledNumber = parseFloat(settled);
  if (Number.isNaN(activeNumber) || Number.isNaN(settledNumber)) return active;
  const blended = settledNumber + (activeNumber - settledNumber) * amount;
  const unitMatch = active.match(/[a-z%]+$/i);
  const unit = unitMatch ? unitMatch[0] : "";
  const formatted =
    unit === "" ? blended.toFixed(4) : Math.round(blended).toString();
  return `${formatted}${unit}`;
}

function computeSelectorAmount(
  split: NonNullable<
    NonNullable<FrameObject["animations"]>[number]["options"]["split"]
  >,
  index: number,
  count: number,
): number {
  const start = split.start ?? 0;
  const end = split.end ?? 1;
  const offset = split.offset ?? 0;
  const a = Math.min(start, end) + offset;
  const b = Math.max(start, end) + offset;
  if (count <= 0) return 1;
  const t = count <= 1 ? 0.5 : index / (count - 1);
  if (a === b) return t === a ? 1 : 0;
  if (t < a) return shapeFalloff(0, split, false);
  if (t > b) return shapeFalloff(0, split, true);
  const inside = b > a ? (t - a) / (b - a) : 0;
  return shapeAmount(inside, split);
}

function shapeAmount(
  value: number,
  split: NonNullable<
    NonNullable<FrameObject["animations"]>[number]["options"]["split"]
  >,
): number {
  const shape = split.shape ?? "square";
  const easeHigh = clamp01(split.easeHigh ?? 0);
  const easeLow = clamp01(split.easeLow ?? 0);
  const x = clamp01(value);
  switch (shape) {
    case "square":
      return 1;
    case "rampUp":
      return easeRampValue(x, easeHigh, easeLow);
    case "rampDown":
      return easeRampValue(1 - x, easeHigh, easeLow);
    case "triangle":
      return easeRampValue(1 - Math.abs(x * 2 - 1), easeHigh, easeLow);
    case "round": {
      const c = x * 2 - 1;
      return easeRampValue(
        Math.sqrt(Math.max(0, 1 - c * c)),
        easeHigh,
        easeLow,
      );
    }
    case "smooth": {
      const smooth = x * x * (3 - 2 * x);
      const triangle = 1 - Math.abs(smooth * 2 - 1);
      return easeRampValue(triangle, easeHigh, easeLow);
    }
    default:
      return 1;
  }
}

function shapeFalloff(
  edge: number,
  split: NonNullable<
    NonNullable<FrameObject["animations"]>[number]["options"]["split"]
  >,
  high: boolean,
): number {
  const shape = split.shape ?? "square";
  if (shape === "square") return 0;
  return high ? 0 : edge;
}

function easeRampValue(value: number, easeHigh: number, easeLow: number) {
  const x = clamp01(value);
  const blend = (1 - easeHigh) * x + easeHigh * smoothStep(x);
  return clamp01(blend - easeLow * (1 - x));
}

function smoothStep(x: number) {
  return x * x * (3 - 2 * x);
}

function clamp01(value: number) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function getSplitAnchorOrigin(
  anchor: "token" | "word" | "line" | "all" | undefined,
  _token: SplitTextToken,
): string | undefined {
  switch (anchor) {
    case "word":
      return "left center";
    case "line":
      return "left center";
    case "all":
      return "left top";
    case "token":
    default:
      return undefined;
  }
}

function getSplitTokenOrderIndex(
  index: number,
  count: number,
  order: "forward" | "reverse" | "center" | "random",
  randomMap?: number[],
) {
  if (order === "reverse") return count - index - 1;
  if (order === "center") return Math.abs(index - (count - 1) / 2);
  if (order === "random" && randomMap) return randomMap[index] ?? index;
  return index;
}

function getSequenceRepeatTokenTime(
  animation: NonNullable<FrameObject["animations"]>[number],
  time: number,
  tokenOffset: number,
  count: number,
) {
  const {
    delay = 0,
    duration,
    repeat,
    repeatDelay = 0,
    split,
  } = animation.options;
  const stagger = split?.stagger ?? 0;
  const sequenceDuration = Math.max(
    duration + Math.max(0, count - 1) * stagger,
    0.0001,
  );
  const cycleDuration = sequenceDuration + repeatDelay;
  if (time < delay) return time - tokenOffset;
  const elapsed = time - delay;
  if (repeat === undefined) return time - tokenOffset;
  if (repeat !== Infinity) {
    const totalDuration = sequenceDuration + repeat * cycleDuration;
    if (elapsed >= totalDuration) return delay + sequenceDuration - tokenOffset;
  }
  const cycleElapsed = elapsed % cycleDuration;
  if (cycleElapsed >= sequenceDuration)
    return delay + sequenceDuration - tokenOffset;
  return delay + cycleElapsed - tokenOffset;
}

export function isObjectInExportTile(
  object: FrameObject,
  tile: ExportTileFrameBounds | undefined,
): boolean {
  if (!tile) return true;
  const bleed = getExportTileBleed(object);
  return rectsIntersect(
    {
      x: object.bounds.x,
      y: object.bounds.y,
      width: object.bounds.width,
      height: object.bounds.height,
    },
    {
      x: tile.x - bleed,
      y: tile.y - bleed,
      width: tile.width + bleed * 2,
      height: tile.height + bleed * 2,
    },
  );
}

function isEvaluatedObjectInExportTile(
  object: EvaluatedFrameObject,
  tile: ExportTileFrameBounds | undefined,
): boolean {
  if (!tile) return true;
  const bleed = getExportTileBleed(object);
  return rectsIntersect(
    {
      x: object.bounds.x,
      y: object.bounds.y,
      width: object.bounds.width,
      height: object.bounds.height,
    },
    {
      x: tile.x - bleed,
      y: tile.y - bleed,
      width: tile.width + bleed * 2,
      height: tile.height + bleed * 2,
    },
  );
}

function getExportTileBleed(
  object: Pick<FrameObject, "style" | "type">,
): number {
  const style = object.style as Record<string, unknown>;
  const maybeFilter = [style.filter, style.boxShadow, style.textShadow]
    .filter((value) => typeof value === "string")
    .join(" ");
  if (/blur|drop-shadow|shadow|filter/i.test(maybeFilter)) return 256;
  return object.type === "svg" ||
    object.type === "html" ||
    object.type === "template"
    ? 64
    : 16;
}

function rectsIntersect(a: Bounds, b: Bounds): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

type ExportRasterOwner = {
  id: string;
  name?: string;
  type: string;
  layer: "object" | "background";
};

function ExportSvgContent({
  bounds,
  content,
  exportTileFrameBounds,
  frameScale,
  markupKind,
  owner,
  renderMode,
  style,
}: {
  bounds: Bounds;
  content: string;
  exportTileFrameBounds?: ExportTileFrameBounds;
  frameScale: number;
  markupKind: "svg";
  owner: ExportRasterOwner;
  renderMode: "preview" | "export";
  style?: CSSProperties;
}) {
  const [raster, setRaster] = useState<SvgRasterResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const styleKey = useMemo(() => JSON.stringify(style ?? {}), [style]);
  const rasterCrop = useMemo(
    () => getObjectRasterCrop(bounds, exportTileFrameBounds),
    [bounds, exportTileFrameBounds],
  );
  const rasterBounds = rasterCrop?.bounds ?? bounds;
  const sourceOffset = rasterCrop?.sourceOffset;
  const shouldRasterize =
    renderMode === "export" &&
    shouldPreRasterizeSvgForExport({
      svg: content,
      bounds: rasterBounds,
      frameScale,
      style,
      markupKind,
    });

  useEffect(() => {
    if (!shouldRasterize) {
      setRaster(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setRaster(null);
    setError(null);
    rasterizeSvgForExport({
      svg: content,
      bounds: rasterBounds,
      frameScale,
      style,
      markupKind,
      sourceBounds: bounds,
      sourceOffset,
    })
      .then((result) => {
        if (!cancelled) setRaster(result);
      })
      .catch((rasterError) => {
        if (!cancelled)
          setError(
            toExportRasterErrorMessage(rasterError, {
              bounds,
              exportTileFrameBounds,
              frameScale,
              markupKind,
              owner,
              rasterBounds,
              sourceOffset,
            }),
          );
      });

    return () => {
      cancelled = true;
    };
  }, [
    bounds,
    content,
    frameScale,
    markupKind,
    rasterBounds,
    renderMode,
    shouldRasterize,
    sourceOffset,
    styleKey,
  ]);

  if (!shouldRasterize) return <HtmlContent content={content} />;
  const diagnostic = getExportRasterDiagnostic({
    bounds,
    exportTileFrameBounds,
    frameScale,
    markupKind,
    owner,
    rasterBounds,
    sourceOffset,
    source: raster?.source ?? "canvas-png",
  });
  if (error)
    return (
      <div
        className="h-full w-full"
        data-clipper-export-svg-raster="failed"
        data-clipper-export-svg-raster-diagnostic={diagnostic}
        data-clipper-export-svg-raster-error={error}
      />
    );
  if (!raster)
    return (
      <div
        className="h-full w-full"
        data-clipper-export-svg-raster="pending"
        data-clipper-export-svg-raster-diagnostic={diagnostic}
      />
    );
  return (
    <img
      alt=""
      className="block"
      data-clipper-export-svg-raster="ready"
      data-clipper-export-svg-raster-diagnostic={diagnostic}
      draggable={false}
      src={raster.url}
      style={
        rasterCrop
          ? {
              left: rasterCrop.sourceOffset.x,
              position: "absolute",
              top: rasterCrop.sourceOffset.y,
              width: rasterCrop.bounds.width,
              height: rasterCrop.bounds.height,
            }
          : { width: "100%", height: "100%" }
      }
    />
  );
}

function toExportRasterErrorMessage(
  error: unknown,
  diagnostic: ExportRasterDiagnosticInput,
) {
  const message = error instanceof Error ? error.message : String(error);
  return `Export SVG rasterization failed: ${message}. ${getExportRasterDiagnostic(diagnostic)}`;
}

type ExportRasterDiagnosticInput = {
  bounds: Bounds;
  exportTileFrameBounds?: ExportTileFrameBounds;
  frameScale: number;
  markupKind: "svg" | "html";
  owner: ExportRasterOwner;
  rasterBounds: Bounds;
  source?: SvgRasterResult["source"];
  sourceOffset?: { x: number; y: number };
};

function getExportRasterDiagnostic({
  bounds,
  exportTileFrameBounds,
  frameScale,
  markupKind,
  owner,
  rasterBounds,
  source,
  sourceOffset,
}: ExportRasterDiagnosticInput) {
  const rasterWidth = Math.max(1, Math.ceil(rasterBounds.width * frameScale));
  const rasterHeight = Math.max(1, Math.ceil(rasterBounds.height * frameScale));
  return [
    `owner=${owner.layer}:${owner.type}:${owner.id}`,
    owner.name ? `name=${JSON.stringify(owner.name)}` : undefined,
    `markup=${markupKind}`,
    source ? `source=${source}` : undefined,
    `raster=${rasterWidth}x${rasterHeight}`,
    `bounds=${formatBounds(bounds)}`,
    exportTileFrameBounds
      ? `tile=${formatBounds(exportTileFrameBounds)}`
      : undefined,
    sourceOffset ? `sourceOffset=${formatPoint(sourceOffset)}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

function getObjectRasterCrop(
  bounds: Bounds,
  tile: ExportTileFrameBounds | undefined,
) {
  if (!tile) return null;
  const crop = intersectBounds(bounds, tile);
  if (!crop) return null;
  if (
    crop.x === bounds.x &&
    crop.y === bounds.y &&
    crop.width === bounds.width &&
    crop.height === bounds.height
  )
    return null;
  return {
    bounds: { x: 0, y: 0, width: crop.width, height: crop.height },
    sourceOffset: { x: crop.x - bounds.x, y: crop.y - bounds.y },
  };
}

function intersectBounds(a: Bounds, b: Bounds): Bounds | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

function formatBounds(bounds: Bounds) {
  return `${formatNumber(bounds.x)},${formatNumber(bounds.y)},${formatNumber(bounds.width)},${formatNumber(bounds.height)}`;
}

function formatPoint(point: { x: number; y: number }) {
  return `${formatNumber(point.x)},${formatNumber(point.y)}`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function areFrameObjectPropsEqual(
  previous: {
    animationsEnabled: boolean;
    exportTileFrameBounds?: ExportTileFrameBounds;
    object: FrameObject;
    parentTransform?: string;
    canSelect: boolean;
    duration: number;
    editing: boolean;
    focusPicking: boolean;
    frameScale: number;
    previewTime: number;
    renderMode: "preview" | "export";
  },
  next: {
    animationsEnabled: boolean;
    exportTileFrameBounds?: ExportTileFrameBounds;
    object: FrameObject;
    parentTransform?: string;
    canSelect: boolean;
    duration: number;
    editing: boolean;
    focusPicking: boolean;
    frameScale: number;
    previewTime: number;
    renderMode: "preview" | "export";
  },
) {
  return (
    previous.object === next.object &&
    previous.parentTransform === next.parentTransform &&
    previous.animationsEnabled === next.animationsEnabled &&
    previous.canSelect === next.canSelect &&
    previous.duration === next.duration &&
    previous.editing === next.editing &&
    previous.exportTileFrameBounds === next.exportTileFrameBounds &&
    previous.focusPicking === next.focusPicking &&
    previous.frameScale === next.frameScale &&
    previous.renderMode === next.renderMode &&
    (!next.animationsEnabled ||
      !isPreviewTimeSensitiveObject(next.object) ||
      previous.previewTime === next.previewTime)
  );
}

function areBackgroundLayerPropsEqual(
  previous: {
    animationsEnabled: boolean;
    background: BackgroundLayer;
    duration: number;
    exportTileFrameBounds?: ExportTileFrameBounds;
    frameScale: number;
    previewTime: number;
    renderMode: "preview" | "export";
  },
  next: {
    animationsEnabled: boolean;
    background: BackgroundLayer;
    duration: number;
    exportTileFrameBounds?: ExportTileFrameBounds;
    frameScale: number;
    previewTime: number;
    renderMode: "preview" | "export";
  },
) {
  const timeSensitive =
    Boolean(next.background.animations?.length) ||
    next.background.elements.some(isPreviewTimeSensitiveObject);
  return (
    previous.animationsEnabled === next.animationsEnabled &&
    previous.background === next.background &&
    previous.duration === next.duration &&
    previous.exportTileFrameBounds === next.exportTileFrameBounds &&
    previous.frameScale === next.frameScale &&
    previous.renderMode === next.renderMode &&
    (!next.animationsEnabled ||
      !timeSensitive ||
      previous.previewTime === next.previewTime)
  );
}

function areBackgroundElementPropsEqual(
  previous: {
    duration: number;
    element: EvaluatedFrameObject;
    frameScale: number;
    previewTime: number;
    renderMode: "preview" | "export";
  },
  next: {
    duration: number;
    element: EvaluatedFrameObject;
    frameScale: number;
    previewTime: number;
    renderMode: "preview" | "export";
  },
) {
  return (
    previous.element === next.element &&
    previous.duration === next.duration &&
    previous.frameScale === next.frameScale &&
    previous.renderMode === next.renderMode &&
    (!next.element.timeSensitive || previous.previewTime === next.previewTime)
  );
}

function isPreviewTimeSensitiveObject(object: FrameObject) {
  return isTimeSensitiveFrameObject(object);
}

function clearSelectionPreviewBounds(element: HTMLElement) {
  element.style.removeProperty("--clipper-selection-preview-left");
  element.style.removeProperty("--clipper-selection-preview-top");
  element.style.removeProperty("--clipper-selection-preview-width");
  element.style.removeProperty("--clipper-selection-preview-height");
}

function findPortalSelectionTargetElement(
  frameViewport: HTMLElement,
  objectId: string,
) {
  const objectRoot =
    frameViewport.querySelector<HTMLElement>("[data-clipper-flat-frame]") ??
    frameViewport;
  const objectCandidates = Array.from(
    objectRoot.querySelectorAll<HTMLElement>(
      `[data-clipper-render-object-id="${cssEscape(objectId)}"],[data-background-element-id="${cssEscape(objectId)}"]`,
    ),
  );
  const rootRect = objectRoot.getBoundingClientRect();
  return (
    objectCandidates.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return (
        rect.right >= rootRect.left &&
        rect.left <= rootRect.right &&
        rect.bottom >= rootRect.top &&
        rect.top <= rootRect.bottom
      );
    }) ??
    objectCandidates[0] ??
    null
  );
}

function setSelectionPreviewBoundsFromTargetRect(
  element: HTMLElement,
  targetRect: DOMRect,
  hostRect: DOMRect,
  insetPx: number,
) {
  element.style.setProperty(
    "--clipper-selection-preview-left",
    `${targetRect.left - hostRect.left - insetPx}px`,
  );
  element.style.setProperty(
    "--clipper-selection-preview-top",
    `${targetRect.top - hostRect.top - insetPx}px`,
  );
  element.style.setProperty(
    "--clipper-selection-preview-width",
    `${targetRect.width + insetPx * 2}px`,
  );
  element.style.setProperty(
    "--clipper-selection-preview-height",
    `${targetRect.height + insetPx * 2}px`,
  );
}

export function SelectionOverlayBox({
  objectId,
  bounds,
  cameraTransform,
  frameScale,
  frameViewportRef,
  handleSizePx = selectorHandleSizePx,
  highlighted,
  interactive,
  offsetPx = selectorOffsetPx,
  overlayOffset = { left: 0, top: 0 },
  portal = false,
  portalHost,
  radius,
  resizable = true,
  uiScale = 1,
  onCornerRadiusChange,
  onResizePointerDown,
}: {
  objectId: string;
  bounds: Bounds;
  cameraTransform: CameraPreviewTransform;
  frameScale: number;
  frameViewportRef?: RefObject<HTMLDivElement | null>;
  handleSizePx?: number;
  highlighted: boolean;
  interactive: boolean;
  offsetPx?: number;
  overlayOffset?: { left: number; top: number };
  portal?: boolean;
  portalHost?: HTMLElement | null;
  radius?: number;
  resizable?: boolean;
  uiScale?: number;
  onCornerRadiusChange?: (radius: number) => void;
  onResizePointerDown: (
    event: PointerEvent<HTMLDivElement>,
    handle: ResizeHandle,
  ) => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const radiusDragRef = useRef<{
    corner: "top-left" | "top-right" | "bottom-right" | "bottom-left";
    startClientX: number;
    startClientY: number;
    startRadius: number;
    objectUnitsPerScreenPx: number;
  } | null>(null);
  const pendingRadiusRef = useRef<number | null>(null);
  const [dragRadius, setDragRadius] = useState<number | null>(null);
  const [optimisticRadius, setOptimisticRadius] = useState<number | null>(null);
  const [radiusHandleHover, setRadiusHandleHover] = useState(false);
  const [objectResizingActive, setObjectResizingActive] = useState(false);
  const viewportBounds = insetBounds(
    boundsToViewport(bounds, cameraTransform, frameScale),
    -offsetPx,
  );
  const edgeHitThicknessPx = portal ? 12 : 12 / uiScale;
  const edgeHitInsetPx = portal ? -4 : -4 / uiScale;
  const edgeLineThicknessPx = portal
    ? highlighted
      ? 2
      : 1
    : (highlighted ? 2 : 1) / uiScale;
  const resizeInteractive = interactive && resizable;
  const edgeHitClass = `${resizeInteractive ? "pointer-events-auto" : "pointer-events-none"} absolute grid place-items-center`;
  const horizontalEdgeHitClass = `${edgeHitClass} ${resizable ? "cursor-ns-resize" : ""}`;
  const verticalEdgeHitClass = `${edgeHitClass} ${resizable ? "cursor-ew-resize" : ""}`;
  const horizontalEdgeLineClass = "w-full opacity-95";
  const verticalEdgeLineClass = "h-full opacity-95";
  const edgeStyle = { backgroundColor: selectorBlue };
  const horizontalEdgeHitStyle = {
    left: edgeHitInsetPx,
    right: edgeHitInsetPx,
    height: edgeHitThicknessPx,
  };
  const verticalEdgeHitStyle = {
    top: edgeHitInsetPx,
    bottom: edgeHitInsetPx,
    width: edgeHitThicknessPx,
  };
  const horizontalEdgeLineStyle = { ...edgeStyle, height: edgeLineThicknessPx };
  const verticalEdgeLineStyle = { ...edgeStyle, width: edgeLineThicknessPx };
  const handleClass = `${resizeInteractive ? "pointer-events-auto" : "pointer-events-none"} absolute bg-white shadow-[0_1px_4px_rgba(0,0,0,0.24)]`;
  const handleStyle = {
    width: portal ? selectorHandleSizePx : handleSizePx,
    height: portal ? selectorHandleSizePx : handleSizePx,
    border: `${portal ? 2 : 2 / uiScale}px solid ${selectorBlue}`,
  };
  const handleStyleWithColor = { ...handleStyle, borderColor: selectorBlue };
  const maxRadius = Math.max(0, Math.min(bounds.width, bounds.height) / 2);
  const displayRadius = clamp(
    dragRadius ?? optimisticRadius ?? radius ?? 0,
    0,
    maxRadius,
  );
  const showRadiusHandles = Boolean(
    !objectResizingActive &&
    resizeInteractive &&
    onCornerRadiusChange &&
    radius !== undefined &&
    (highlighted || radiusHandleHover || dragRadius !== null),
  );
  const objectViewportWidth = Math.max(viewportBounds.width - offsetPx * 2, 1);
  const objectViewportHeight = Math.max(
    viewportBounds.height - offsetPx * 2,
    1,
  );
  const objectLeftPercent =
    viewportBounds.width > 0 ? (offsetPx / viewportBounds.width) * 100 : 0;
  const objectTopPercent =
    viewportBounds.height > 0 ? (offsetPx / viewportBounds.height) * 100 : 0;
  const objectWidthPercent =
    viewportBounds.width > 0
      ? (objectViewportWidth / viewportBounds.width) * 100
      : 100;
  const objectHeightPercent =
    viewportBounds.height > 0
      ? (objectViewportHeight / viewportBounds.height) * 100
      : 100;
  const radiusProgressX = clamp(
    displayRadius / Math.max(bounds.width, 1),
    0,
    0.5,
  );
  const radiusProgressY = clamp(
    displayRadius / Math.max(bounds.height, 1),
    0,
    0.5,
  );
  const minRadiusHandleInsetPx = 20;
  const minRadiusHandleInsetXPercent =
    viewportBounds.width > 0
      ? (minRadiusHandleInsetPx / viewportBounds.width) * 100
      : 0;
  const minRadiusHandleInsetYPercent =
    viewportBounds.height > 0
      ? (minRadiusHandleInsetPx / viewportBounds.height) * 100
      : 0;
  const radiusInsetXPercent = clamp(
    radiusProgressX * objectWidthPercent,
    minRadiusHandleInsetXPercent,
    objectWidthPercent / 2,
  );
  const radiusInsetYPercent = clamp(
    radiusProgressY * objectHeightPercent,
    minRadiusHandleInsetYPercent,
    objectHeightPercent / 2,
  );
  const radiusLeftPercent = objectLeftPercent + radiusInsetXPercent;
  const radiusRightPercent =
    objectLeftPercent + objectWidthPercent - radiusInsetXPercent;
  const radiusTopPercent = objectTopPercent + radiusInsetYPercent;
  const radiusBottomPercent =
    objectTopPercent + objectHeightPercent - radiusInsetYPercent;
  const radiusTopLeftStyle = {
    left: `${radiusLeftPercent}%`,
    top: `${radiusTopPercent}%`,
  };
  const radiusTopRightStyle = {
    left: `${radiusRightPercent}%`,
    top: `${radiusTopPercent}%`,
  };
  const radiusBottomRightStyle = {
    left: `${radiusRightPercent}%`,
    top: `${radiusBottomPercent}%`,
  };
  const radiusBottomLeftStyle = {
    left: `${radiusLeftPercent}%`,
    top: `${radiusBottomPercent}%`,
  };
  const radiusHandleClass =
    "absolute z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#159dff] bg-white cursor-default pointer-events-auto";
  const topLeftHandleClass = `${handleClass} left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize`;
  const topRightHandleClass = `${handleClass} right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize`;
  const bottomRightHandleClass = `${handleClass} bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize`;
  const bottomLeftHandleClass = `${handleClass} bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize`;
  const boxStyle = portal
    ? ({
        left: `var(--clipper-selection-preview-left, var(--clipper-selection-base-left, ${viewportBounds.x + overlayOffset.left}px))`,
        top: `var(--clipper-selection-preview-top, var(--clipper-selection-base-top, ${viewportBounds.y + overlayOffset.top}px))`,
        width: `var(--clipper-selection-preview-width, var(--clipper-selection-base-width, ${viewportBounds.width}px))`,
        height: `var(--clipper-selection-preview-height, var(--clipper-selection-base-height, ${viewportBounds.height}px))`,
        position: "absolute",
        transform:
          "translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px))",
        willChange: "left, top, width, height, transform",
        zIndex: 70,
      } as CSSProperties)
    : ({
        left: `var(--clipper-selection-preview-left, ${viewportBounds.x + overlayOffset.left}px)`,
        top: `var(--clipper-selection-preview-top, ${viewportBounds.y + overlayOffset.top}px)`,
        width: `var(--clipper-selection-preview-width, ${viewportBounds.width}px)`,
        height: `var(--clipper-selection-preview-height, ${viewportBounds.height}px)`,
        transform:
          "translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px))",
        zIndex: 70,
      } as CSSProperties);

  useLayoutEffect(() => {
    const element = boxRef.current;
    if (!element) return;
    element.style.removeProperty("--clipper-drag-x");
    element.style.removeProperty("--clipper-drag-y");
    clearSelectionPreviewBounds(element);
  }, [
    bounds.height,
    bounds.width,
    bounds.x,
    bounds.y,
    cameraTransform.scale,
    cameraTransform.x,
    cameraTransform.y,
    frameScale,
  ]);

  useEffect(() => {
    function clearPreviewBounds() {
      const element = boxRef.current;
      if (!element) return;
      clearSelectionPreviewBounds(element);
    }

    function updatePreviewBounds(event: Event) {
      const detail = updateObjectPreviewBoundsCache(event);
      if (detail?.objectId !== objectId || !detail.bounds) return;
      const element = boxRef.current;
      if (!element) return;
      const nextViewportBounds = insetBounds(
        boundsToViewport(detail.bounds, cameraTransform, frameScale),
        -offsetPx,
      );
      if (portal && portalHost && frameViewportRef?.current) {
        if (element.dataset.clipperDragPreviewActive === "true") return;
        const targetElement = findPortalSelectionTargetElement(
          frameViewportRef.current,
          objectId,
        );
        if (targetElement) {
          setSelectionPreviewBoundsFromTargetRect(
            element,
            targetElement.getBoundingClientRect(),
            portalHost.getBoundingClientRect(),
            offsetPx,
          );
          return;
        }
        const portalBounds = viewportBoundsToPortal(
          nextViewportBounds,
          getFramePortalOverlayTransform(
            frameViewportRef.current.getBoundingClientRect(),
            portalHost.getBoundingClientRect(),
            frameScale,
          ),
        );
        element.style.setProperty(
          "--clipper-selection-preview-left",
          `${portalBounds.x}px`,
        );
        element.style.setProperty(
          "--clipper-selection-preview-top",
          `${portalBounds.y}px`,
        );
        element.style.setProperty(
          "--clipper-selection-preview-width",
          `${portalBounds.width}px`,
        );
        element.style.setProperty(
          "--clipper-selection-preview-height",
          `${portalBounds.height}px`,
        );
        return;
      }
      element.style.setProperty(
        "--clipper-selection-preview-left",
        `${nextViewportBounds.x + overlayOffset.left}px`,
      );
      element.style.setProperty(
        "--clipper-selection-preview-top",
        `${nextViewportBounds.y + overlayOffset.top}px`,
      );
      element.style.setProperty(
        "--clipper-selection-preview-width",
        `${nextViewportBounds.width}px`,
      );
      element.style.setProperty(
        "--clipper-selection-preview-height",
        `${nextViewportBounds.height}px`,
      );
    }

    window.addEventListener(
      "clipper:object-preview-bounds",
      updatePreviewBounds,
    );
    window.addEventListener(
      "clipper:number-input-scrub-end",
      clearObjectPreviewBoundsCache,
    );
    window.addEventListener(
      "clipper:number-input-scrub-end",
      clearPreviewBounds,
    );
    return () => {
      window.removeEventListener(
        "clipper:object-preview-bounds",
        updatePreviewBounds,
      );
      window.removeEventListener(
        "clipper:number-input-scrub-end",
        clearObjectPreviewBoundsCache,
      );
      window.removeEventListener(
        "clipper:number-input-scrub-end",
        clearPreviewBounds,
      );
    };
  }, [
    cameraTransform,
    frameScale,
    frameViewportRef,
    objectId,
    offsetPx,
    overlayOffset.left,
    overlayOffset.top,
    portal,
    portalHost,
  ]);

  const syncPortalBox = useCallback(() => {
    const element = boxRef.current;
    const frameViewport = frameViewportRef?.current;
    if (!element || !frameViewport || !portal || !portalHost) return;
    if (element.dataset.clipperDragPreviewActive === "true") return;
    const objectElement = findPortalSelectionTargetElement(
      frameViewport,
      objectId,
    );
    if (objectElement) {
      syncTargetRectToPortalElement(
        element,
        objectElement.getBoundingClientRect(),
        portalHost.getBoundingClientRect(),
        offsetPx,
      );
      return;
    }
    syncViewportBoundsToPortalElement(element, viewportBounds, {
      cameraTransform,
      frameScale,
      frameViewportRef,
      portalHost,
    });
  }, [
    cameraTransform,
    frameScale,
    frameViewportRef,
    objectId,
    offsetPx,
    portal,
    portalHost,
    viewportBounds,
  ]);
  usePortalOverlayFrameSync(portal ? syncPortalBox : noop);

  useEffect(() => {
    function updateObjectResizingActive(event: Event) {
      const active = Boolean(
        (event as CustomEvent<{ active?: boolean }>).detail?.active,
      );
      setObjectResizingActive(active);
      if (active) setRadiusHandleHover(false);
    }

    window.addEventListener(
      "clipper:object-resize-active",
      updateObjectResizingActive,
    );
    return () =>
      window.removeEventListener(
        "clipper:object-resize-active",
        updateObjectResizingActive,
      );
  }, []);

  useEffect(() => {
    if (
      optimisticRadius !== null &&
      Math.abs((radius ?? 0) - optimisticRadius) < 0.5
    )
      setOptimisticRadius(null);
  }, [optimisticRadius, radius]);

  useEffect(() => {
    if (dragRadius === null && optimisticRadius === null)
      setObjectRadiusPreview(objectId, null);
  }, [dragRadius, objectId, optimisticRadius, radius]);

  useEffect(() => {
    if (dragRadius === null) return;
    function stopRadiusDrag() {
      flushRadiusChange();
      radiusDragRef.current = null;
      setDragRadius(null);
    }
    window.addEventListener("pointerup", stopRadiusDrag);
    window.addEventListener("pointercancel", stopRadiusDrag);
    return () => {
      window.removeEventListener("pointerup", stopRadiusDrag);
      window.removeEventListener("pointercancel", stopRadiusDrag);
    };
  }, [dragRadius]);

  function flushRadiusChange() {
    const radius = pendingRadiusRef.current;
    pendingRadiusRef.current = null;
    if (radius !== null) onCornerRadiusChange?.(radius);
  }

  function previewRadiusChange(radius: number) {
    pendingRadiusRef.current = radius;
    setObjectRadiusPreview(objectId, radius);
  }

  function updateRadiusFromPointer(event: PointerEvent<HTMLButtonElement>) {
    const drag = radiusDragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    const inwardX =
      drag.corner === "top-right" || drag.corner === "bottom-right" ? -dx : dx;
    const inwardY =
      drag.corner === "bottom-right" || drag.corner === "bottom-left"
        ? -dy
        : dy;
    const dominantDelta =
      Math.abs(inwardX) >= Math.abs(inwardY) ? inwardX : inwardY;
    const diagonalDelta = dominantDelta * Math.SQRT2;
    const nextRadius = Math.round(
      clamp(
        drag.startRadius + diagonalDelta * drag.objectUnitsPerScreenPx,
        0,
        maxRadius,
      ),
    );
    setDragRadius(nextRadius);
    setOptimisticRadius(nextRadius);
    previewRadiusChange(nextRadius);
  }

  function startRadiusDrag(
    event: PointerEvent<HTMLButtonElement>,
    corner: "top-left" | "top-right" | "bottom-right" | "bottom-left",
  ) {
    event.preventDefault();
    event.stopPropagation();
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const insetX =
      rect.width * clamp(offsetPx / Math.max(viewportBounds.width, 1), 0, 0.45);
    const insetY =
      rect.height *
      clamp(offsetPx / Math.max(viewportBounds.height, 1), 0, 0.45);
    const objectWidth = Math.max(rect.width - insetX * 2, 1);
    const objectHeight = Math.max(rect.height - insetY * 2, 1);
    const screenPxPerObjectUnit = Math.max(
      0.001,
      Math.min(
        objectWidth / Math.max(bounds.width, 1),
        objectHeight / Math.max(bounds.height, 1),
      ),
    );
    radiusDragRef.current = {
      corner,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRadius: displayRadius,
      objectUnitsPerScreenPx: 1 / screenPxPerObjectUnit,
    };
    setDragRadius(displayRadius);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  return (
    <div
      ref={boxRef}
      data-frame-selection-box={objectId}
      data-frame-selection-box-portal={portal ? "true" : undefined}
      className={`${portal ? "absolute" : "absolute"} pointer-events-none bg-transparent`}
      style={boxStyle}
    >
      <div
        className={`${horizontalEdgeHitClass} top-0 -translate-y-1/2`}
        style={horizontalEdgeHitStyle}
        onPointerDown={(event) => onResizePointerDown(event, "top")}
      >
        <span
          className={horizontalEdgeLineClass}
          style={horizontalEdgeLineStyle}
        />
      </div>
      <div
        className={`${horizontalEdgeHitClass} bottom-0 translate-y-1/2`}
        style={horizontalEdgeHitStyle}
        onPointerDown={(event) => onResizePointerDown(event, "bottom")}
      >
        <span
          className={horizontalEdgeLineClass}
          style={horizontalEdgeLineStyle}
        />
      </div>
      <div
        className={`${verticalEdgeHitClass} left-0 -translate-x-1/2`}
        style={verticalEdgeHitStyle}
        onPointerDown={(event) => onResizePointerDown(event, "left")}
      >
        <span className={verticalEdgeLineClass} style={verticalEdgeLineStyle} />
      </div>
      <div
        className={`${verticalEdgeHitClass} right-0 translate-x-1/2`}
        style={verticalEdgeHitStyle}
        onPointerDown={(event) => onResizePointerDown(event, "right")}
      >
        <span className={verticalEdgeLineClass} style={verticalEdgeLineStyle} />
      </div>
      {resizable ? (
        <>
          <div
            className={topLeftHandleClass}
            style={handleStyleWithColor}
            onPointerDown={(event) => onResizePointerDown(event, "top-left")}
          />
          <div
            className={topRightHandleClass}
            style={handleStyleWithColor}
            onPointerDown={(event) => onResizePointerDown(event, "top-right")}
          />
          <div
            className={bottomRightHandleClass}
            style={handleStyleWithColor}
            onPointerDown={(event) =>
              onResizePointerDown(event, "bottom-right")
            }
          />
          <div
            className={bottomLeftHandleClass}
            style={handleStyleWithColor}
            onPointerDown={(event) => onResizePointerDown(event, "bottom-left")}
          />
        </>
      ) : null}
      {showRadiusHandles ? (
        <>
          {dragRadius !== null ? (
            <div className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-[9px] bg-[#159dff] px-2.5 py-1 text-xs font-extrabold text-white shadow-[0_10px_26px_rgba(0,0,0,0.32)]">
              Radius {displayRadius}px
            </div>
          ) : null}
          <button
            aria-label="Adjust top-left corner radius"
            className={radiusHandleClass}
            data-radius-handle-object-id={objectId}
            style={radiusTopLeftStyle}
            onPointerEnter={() => setRadiusHandleHover(true)}
            onPointerLeave={() => setRadiusHandleHover(false)}
            onPointerDown={(event) => startRadiusDrag(event, "top-left")}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                updateRadiusFromPointer(event);
            }}
          />
          <button
            aria-label="Adjust top-right corner radius"
            className={radiusHandleClass}
            data-radius-handle-object-id={objectId}
            style={radiusTopRightStyle}
            onPointerEnter={() => setRadiusHandleHover(true)}
            onPointerLeave={() => setRadiusHandleHover(false)}
            onPointerDown={(event) => startRadiusDrag(event, "top-right")}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                updateRadiusFromPointer(event);
            }}
          />
          <button
            aria-label="Adjust bottom-right corner radius"
            className={radiusHandleClass}
            data-radius-handle-object-id={objectId}
            style={radiusBottomRightStyle}
            onPointerEnter={() => setRadiusHandleHover(true)}
            onPointerLeave={() => setRadiusHandleHover(false)}
            onPointerDown={(event) => startRadiusDrag(event, "bottom-right")}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                updateRadiusFromPointer(event);
            }}
          />
          <button
            aria-label="Adjust bottom-left corner radius"
            className={radiusHandleClass}
            data-radius-handle-object-id={objectId}
            style={radiusBottomLeftStyle}
            onPointerEnter={() => setRadiusHandleHover(true)}
            onPointerLeave={() => setRadiusHandleHover(false)}
            onPointerDown={(event) => startRadiusDrag(event, "bottom-left")}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                updateRadiusFromPointer(event);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function getNumericStyleValue(value: string | number | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
}

function formatStyleLength(value: string | number | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return `${value}px`;
  if (typeof value === "string" && value.trim()) return value;
  return "0px";
}

function getAutoHeightTextBounds(
  object: FrameObject,
  editable: HTMLElement | null,
): Bounds | undefined {
  if (!editable) return undefined;
  const measuredHeight = Math.max(
    object.bounds.height,
    Math.ceil(editable.scrollHeight),
  );
  return measuredHeight === object.bounds.height
    ? undefined
    : { ...object.bounds, height: measuredHeight };
}

function setObjectRadiusPreview(objectId: string, radius: number | null) {
  const target = document.querySelector<HTMLElement>(
    `[data-clipper-render-object-id="${cssEscape(objectId)}"]`,
  );
  if (!target) return;
  if (radius === null) target.style.removeProperty("--clipper-radius-preview");
  else target.style.setProperty("--clipper-radius-preview", `${radius}px`);
}

export function DragSelectionBox({
  dragSelectionBoxRef,
  bounds,
  cameraTransform,
  frameScale,
  frameViewportRef,
  portalHost,
  uiScale,
  visible,
}: {
  dragSelectionBoxRef: RefObject<HTMLDivElement | null>;
  bounds: Bounds;
  cameraTransform: CameraPreviewTransform;
  frameScale: number;
  frameViewportRef: RefObject<HTMLDivElement | null>;
  portalHost?: HTMLElement | null;
  uiScale: number;
  visible: boolean;
}) {
  useLayoutEffect(() => {
    const element = dragSelectionBoxRef.current;
    if (!element) return;
    const frameRect = frameViewportRef.current?.getBoundingClientRect();
    const hostRect = portalHost?.getBoundingClientRect();
    const viewportBounds = boundsToViewport(
      bounds,
      cameraTransform,
      frameScale,
    );
    const portalBounds =
      frameRect && hostRect
        ? viewportBoundsToPortal(
            viewportBounds,
            getFramePortalOverlayTransform(frameRect, hostRect, frameScale),
          )
        : viewportBounds;
    updateDragSelectionBoxElement(
      element,
      bounds,
      frameScale,
      visible,
      1,
      { x: 0, y: 0 },
      portalBounds,
    );
  }, [
    bounds,
    cameraTransform,
    dragSelectionBoxRef,
    frameScale,
    frameViewportRef,
    portalHost,
    uiScale,
    visible,
  ]);

  const box = (
    <div
      ref={dragSelectionBoxRef}
      className="pointer-events-none absolute left-0 top-0 border bg-[#159dff]/10 opacity-100 will-change-transform"
      style={{ borderColor: selectorBlue, zIndex: 69 }}
    />
  );
  return portalHost ? createPortal(box, portalHost) : box;
}

export const BackgroundLayerView = memo(function BackgroundLayerView({
  animationsEnabled,
  background,
  canSelect,
  duration,
  exportTileFrameBounds,
  frameScale,
  previewTime,
  renderMode,
  onPointerDown,
}: {
  animationsEnabled: boolean;
  background: BackgroundLayer;
  canSelect?: boolean;
  duration: number;
  exportTileFrameBounds?: ExportTileFrameBounds;
  frameScale: number;
  previewTime: number;
  renderMode: "preview" | "export";
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  const evaluatedBackground = useMemo(
    () =>
      evaluateBackgroundLayer(background, previewTime, duration, {
        animations: animationsEnabled,
      }),
    [animationsEnabled, background, duration, previewTime],
  );
  const layerStyle = evaluatedBackground.renderStyle as CSSProperties;
  const fillStyle = evaluatedBackground.fillStyle as CSSProperties;

  return (
    <div
      className={`${canSelect ? "pointer-events-auto" : "pointer-events-none"} absolute inset-0 ${background.stretchToElements ? "overflow-visible" : "overflow-hidden"}`}
      data-layer-id={background.id}
      onPointerDown={
        canSelect && !background.locked ? onPointerDown : undefined
      }
      style={layerStyle}
    >
      <div
        className="absolute"
        data-background-fill-id={background.id}
        style={fillStyle}
      />
      {evaluatedBackground.elements
        .filter(
          (element) =>
            !element.hidden &&
            isEvaluatedObjectInExportTile(element, exportTileFrameBounds),
        )
        .map((element) => (
          <BackgroundElementView
            duration={duration}
            element={element}
            exportTileFrameBounds={exportTileFrameBounds}
            frameScale={frameScale}
            key={element.id}
            previewTime={previewTime}
            renderMode={renderMode}
          />
        ))}
    </div>
  );
}, areBackgroundLayerPropsEqual);

export const BackgroundElementView = memo(function BackgroundElementView({
  element,
  exportTileFrameBounds,
  frameScale,
  previewTime,
  renderMode,
}: {
  duration: number;
  element: EvaluatedFrameObject;
  exportTileFrameBounds?: ExportTileFrameBounds;
  frameScale: number;
  previewTime: number;
  renderMode: "preview" | "export";
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const animation = {
    style: element.renderStyle,
    content: element.renderContent,
  };
  const objectTransform =
    typeof element.style.transform === "string"
      ? element.style.transform
      : undefined;
  const animationTransform =
    typeof animation.style.transform === "string"
      ? animation.style.transform
      : undefined;
  const style = {
    ...element.style,
    ...animation.style,
    left: element.bounds.x,
    top: element.bounds.y,
    width: element.bounds.width,
    height: element.bounds.height,
    transform:
      renderMode === "export"
        ? `${animationTransform ?? ""} ${objectTransform ?? ""}`.trim()
        : `translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px)) ${animationTransform ?? ""} ${objectTransform ?? ""}`.trim(),
    willChange: renderMode === "export" ? undefined : "transform",
  } as CSSProperties;
  const content = animation.content ?? element.content;
  const textLines = useMemo(() => content?.split("\n") ?? [], [content]);

  useLayoutEffect(() => {
    const target = elementRef.current;
    if (!target || renderMode === "export") return;
    target.style.removeProperty("--clipper-drag-x");
    target.style.removeProperty("--clipper-drag-y");
  }, [element.bounds.x, element.bounds.y, renderMode]);

  return (
    <div
      ref={elementRef}
      className="absolute flex select-none flex-col justify-center overflow-hidden whitespace-pre-line"
      data-background-element-id={element.locked ? undefined : element.id}
      style={{
        ...style,
        ...(element.locked ? { pointerEvents: "none" as const } : {}),
      }}
    >
      {element.type === "text"
        ? textLines.map((line, index) => (
            <span key={`${line}-${index}`}>{line}</span>
          ))
        : null}
      {element.type === "svg" && content ? (
        <ExportSvgContent
          bounds={element.bounds}
          content={content}
          exportTileFrameBounds={exportTileFrameBounds}
          frameScale={frameScale}
          markupKind="svg"
          owner={{
            id: element.id,
            name: element.name,
            type: element.type,
            layer: "background",
          }}
          renderMode={renderMode}
          style={style}
        />
      ) : null}
      {element.type === "pattern2d" ? (
        <Pattern2DContent object={element} />
      ) : null}
      {element.type === "code" ? <CodeObjectFrame object={element} /> : null}
      {(element.type === "html" ||
        element.type === "template" ||
        element.type === "custom-renderer") &&
      content ? (
        <HtmlContent
          content={content}
          props={element.type === "custom-renderer" ? element.props : undefined}
        />
      ) : null}
      {element.type !== "text" &&
      element.type !== "svg" &&
      element.type !== "html" &&
      element.type !== "template" &&
      element.type !== "custom-renderer" &&
      element.type !== "pattern2d" &&
      element.type !== "code" &&
      content
        ? content
        : null}
    </div>
  );
}, areBackgroundElementPropsEqual);

function evaluateObjectForPreview(
  object: FrameObject,
  time: number,
  duration: number,
  animationsEnabled: boolean,
): EvaluatedFrameObject {
  return evaluateFrameObject(object, time, duration, {
    animations: animationsEnabled,
  });
}

export function Pattern2DContent({ object }: { object: FrameObject }) {
  const patternId = `pattern2d-${object.id}`;
  const svg = useMemo(
    () => buildPattern2dSvg(object, patternId),
    [object, patternId],
  );
  return (
    <div
      className="absolute inset-0 h-full w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function MediaContent({
  isPlaying,
  object,
  previewTime,
}: {
  isPlaying: boolean;
  object: FrameObject;
  previewTime: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [videoFrameProvider, setVideoFrameProvider] =
    useState<WebCodecsVideoFrameProvider | null>(null);
  const src =
    typeof object.style.src === "string" && object.style.src.length > 0
      ? normalizeClipperMediaUrl(object.style.src)
      : null;
  const objectFit = readMediaObjectFit(
    typeof object.style.objectFit === "string" ? object.style.objectFit : null,
  );
  const mediaAssetType = src ? getMediaAssetType(src) : null;

  useEffect(() => {
    let cancelled = false;
    setVideoFrameProvider(null);
    if (!src || mediaAssetType !== "video") return;
    void getWebCodecsVideoFrameProvider(src)
      .then((provider) => {
        if (!cancelled) setVideoFrameProvider(provider);
      })
      .catch((error) => {
        console.warn("MediaContent: WebCodecs video decode failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaAssetType, src]);

  useEffect(() => {
    if (mediaAssetType !== "video" || !videoFrameProvider) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (
      canvas.width !== videoFrameProvider.width ||
      canvas.height !== videoFrameProvider.height
    ) {
      canvas.width = videoFrameProvider.width;
      canvas.height = videoFrameProvider.height;
    }
    const frame = videoFrameProvider.getFrameAt(
      getMediaVideoTime(object, previewTime),
    );
    if (!frame) return;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("MediaContent: 2D canvas unavailable");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(frame.frame, 0, 0, canvas.width, canvas.height);
  }, [mediaAssetType, object, previewTime, videoFrameProvider]);

  if (src && mediaAssetType === "video")
    return (
      <canvas
        ref={canvasRef}
        className="block h-full w-full select-none"
        draggable={false}
        style={{ objectFit }}
      />
    );

  if (src)
    return (
      <img
        alt=""
        className="block h-full w-full select-none"
        draggable={false}
        src={src}
        style={{ objectFit }}
      />
    );

  return (
    <img
      alt=""
      className="block h-full w-full select-none"
      draggable={false}
      src={MEDIA_PLACEHOLDER_DATA_URL}
      style={{ objectFit: "fill" }}
    />
  );
}

function readMediaObjectFit(value: string | null): CSSProperties["objectFit"] {
  if (
    value === "cover" ||
    value === "contain" ||
    value === "fill" ||
    value === "none" ||
    value === "scale-down"
  )
    return value;
  return "cover";
}

export function HtmlContent({
  content,
  props,
}: {
  content: string;
  props?: Record<string, unknown>;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const serializedProps = useMemo(
    () => (props === undefined ? undefined : JSON.stringify(props)),
    [props],
  );

  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    if (serializedProps === undefined) {
      host.removeAttribute("data-clipper-props");
    } else {
      host.setAttribute("data-clipper-props", serializedProps);
    }
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });

    try {
      root.innerHTML = content;
      const scripts = Array.from(root.querySelectorAll("script"));
      for (const script of scripts) {
        const executable = document.createElement("script");
        for (const attribute of script.attributes)
          executable.setAttribute(attribute.name, attribute.value);
        executable.text = script.text;
        script.replaceWith(executable);
      }
    } catch (caught) {
      root.replaceChildren(
        createHtmlContentError(framePreviewErrorMessage(caught)),
      );
    }

    return () => {
      for (const node of Array.from(
        root.querySelectorAll<HTMLElement>("[data-clipper-three-root]"),
      )) {
        const cleanup = (node as { __clipperThreeCleanup?: unknown })
          .__clipperThreeCleanup;
        if (typeof cleanup === "function") cleanup();
      }
      root.replaceChildren();
    };
  }, [content, serializedProps]);

  return (
    <div ref={ref} className="h-full w-full" data-clipper-shadow-render-root />
  );
}

function createHtmlContentError(message: string) {
  const pre = document.createElement("pre");
  pre.className =
    "m-0 h-full w-full overflow-auto whitespace-pre-wrap bg-[#16090d] p-4 font-mono text-[14px] leading-relaxed text-[#ffb4b4]";
  pre.textContent = message;
  return pre;
}
