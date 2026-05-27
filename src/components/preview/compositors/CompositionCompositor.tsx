import {
  useEffect,
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
} from "react";
import type {
  AdjustmentLayer,
  Bounds,
  CameraObjectProps,
  CompositionClip,
  FrameObject,
  RichTextSegment,
  TransitionLayer,
} from "../../../core/types";
import { DomBackend } from "../backends/DomBackend";
import { RasterBackend } from "../backends/RasterBackend";
import type { CompositionBackend } from "../backends/CompositionBackend";
import { useCompositionCache } from "../cache/useCompositionCache";
import { renderCompositionPreview } from "../render/sceneRender";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../../core/types";
import type { ComposeDrawTool, ExportTileFrameBounds } from "../FramePreview";
import {
  ComposeAuthorView,
  type CameraPreviewMode,
  type ComposeAuthorViewState,
} from "../three/ComposeAuthorView";
import { compositionHasCameraLayer } from "./useCompositionCamera";
import type { PreviewFps } from "../../../core/previewFps";

type CompositionCompositorProps = {
  active: boolean;
  activeShapeTool?: ComposeDrawTool | null;
  handToolActive?: boolean;
  animationsEnabled: boolean;
  canSelect: boolean;
  editingTextObjectId: string | null;
  exportTileFrameBounds?: ExportTileFrameBounds;
  /**
   * When true the composition is rendered as a sealed flat output via
   * `RasterBackend`. When false the composition exposes its live React
   * tree via `DomBackend` for in-place editing. Direct mode passes true,
   * Compose mode passes false.
   */
  flatten: boolean;
  focusPicking: boolean;
  frameScale: number;
  previewFps: PreviewFps;
  hideNullObjects?: boolean;
  isPlaying: boolean;
  part: CompositionClip;
  localTime: number;
  duration: number;
  renderClockSceneTime: number;
  renderMode: "preview" | "export";
  adjustmentLayers?: AdjustmentLayer[];
  transitionLayers?: TransitionLayer[];
  onObjectPointerDown: (
    event: PointerEvent<HTMLDivElement>,
    object: FrameObject,
  ) => void;
  onObjectContextMenu?: (
    event: ReactMouseEvent<HTMLDivElement>,
    object: FrameObject,
  ) => void;
  onTextEditCommit: (
    objectId: string,
    content: string,
    richText?: RichTextSegment[],
    bounds?: Bounds,
  ) => void;
  onTextEditEnd?: () => void;
  onTextObjectDoubleClick: (
    event: ReactMouseEvent<HTMLDivElement>,
    object: FrameObject,
  ) => void;
  selectedObjectId?: string | null;
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
  onAuthorPreviewModeChange?: (mode: CameraPreviewMode) => void;
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
  cameraPreviewOverride?: CameraObjectProps | null;
  isPostProcessSource?: boolean;
};

export const CompositionCompositor = memo(function CompositionCompositor(
  props: CompositionCompositorProps,
) {
  const compositionRef = useRef<HTMLDivElement | null>(null);
  const cache = useCompositionCache();
  const compositionId = props.part.compositionId ?? props.part.id;
  cache.getCacheKey(compositionId);
  const sourceHasCameraLayer =
    !props.flatten &&
    Boolean(props.onCameraPropsChange) &&
    compositionHasCameraLayer(props.part);
  const [previewMode, setPreviewMode] = useState<CameraPreviewMode>(
    props.authorViewState?.previewMode ?? "pip",
  );
  useEffect(() => {
    if (!props.authorViewState) return;
    setPreviewMode(props.authorViewState.previewMode);
  }, [props.authorViewState]);
  const renderPart =
    sourceHasCameraLayer && previewMode === "2d"
      ? {
          ...props.part,
          objects: props.part.objects.filter(
            (object) => object.type !== "camera",
          ),
        }
      : props.part;
  const composition = renderCompositionPreview({
    composition: renderPart,
    localTime: props.localTime,
    duration: props.duration,
    viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    frameScale: props.frameScale,
  });
  const Backend: CompositionBackend = props.flatten
    ? RasterBackend
    : DomBackend;
  const showAuthorView = sourceHasCameraLayer;
  const cameraHandledExternally = showAuthorView && previewMode !== "2d";
  const authoringInteractionsEnabled = !showAuthorView || previewMode === "2d";

  const backendNode = useMemo(
    () => (
      <Backend
        active={props.active}
        isPostProcessSource={props.isPostProcessSource}
        cameraPreviewOverride={props.cameraPreviewOverride}
        activeShapeTool={
          authoringInteractionsEnabled ? props.activeShapeTool : null
        }
        animationsEnabled={props.animationsEnabled}
        cameraHandledExternally={cameraHandledExternally}
        canSelect={authoringInteractionsEnabled ? props.canSelect : false}
        duration={composition.duration}
        editingTextObjectId={
          authoringInteractionsEnabled ? props.editingTextObjectId : null
        }
        exportTileFrameBounds={props.exportTileFrameBounds}
        focusPicking={authoringInteractionsEnabled ? props.focusPicking : false}
        frameScale={props.frameScale}
        previewFps={props.previewFps}
        hideNullObjects={props.hideNullObjects ?? false}
        hostRef={compositionRef}
        isPlaying={props.isPlaying}
        localTime={composition.localTime}
        part={renderPart}
        renderClockSceneTime={props.renderClockSceneTime}
        renderMode={props.renderMode}
        adjustmentLayers={props.adjustmentLayers}
        transitionLayers={props.transitionLayers}
        onObjectPointerDown={props.onObjectPointerDown}
        onObjectContextMenu={props.onObjectContextMenu}
        onTextEditCommit={props.onTextEditCommit}
        onTextEditEnd={props.onTextEditEnd}
        onTextObjectDoubleClick={props.onTextObjectDoubleClick}
      />
    ),
    [
      Backend,
      props.active,
      props.isPostProcessSource,
      props.cameraPreviewOverride,
      authoringInteractionsEnabled,
      props.activeShapeTool,
      props.animationsEnabled,
      cameraHandledExternally,
      props.canSelect,
      composition.duration,
      props.editingTextObjectId,
      props.exportTileFrameBounds,
      props.focusPicking,
      props.frameScale,
      props.previewFps,
      props.hideNullObjects,
      props.isPlaying,
      composition.localTime,
      renderPart,
      props.renderClockSceneTime,
      props.renderMode,
      props.adjustmentLayers,
      props.transitionLayers,
      props.onObjectPointerDown,
      props.onObjectContextMenu,
      props.onTextEditCommit,
      props.onTextEditEnd,
      props.onTextObjectDoubleClick,
    ],
  );

  const renderComposition = useCallback(() => backendNode, [backendNode]);

  const pipBackendProps = useMemo(
    () => ({
      animationsEnabled: props.animationsEnabled,
      frameScale: props.frameScale,
      previewFps: props.previewFps,
      hideNullObjects: props.hideNullObjects ?? false,
      isPlaying: props.isPlaying,
      duration: composition.duration,
      renderClockSceneTime: props.renderClockSceneTime,
      renderMode: props.renderMode,
      exportTileFrameBounds: props.exportTileFrameBounds,
    }),
    [
      props.animationsEnabled,
      props.frameScale,
      props.previewFps,
      props.hideNullObjects,
      props.isPlaying,
      composition.duration,
      props.renderClockSceneTime,
      props.renderMode,
      props.exportTileFrameBounds,
    ],
  );

  if (showAuthorView && props.onCameraPropsChange) {
    if (previewMode === "2d") return backendNode;

    return (
      <div className="absolute inset-0">
        <ComposeAuthorView
          part={props.part}
          selectedObjectId={props.selectedObjectId ?? null}
          handToolActive={props.handToolActive ?? false}
          onCameraPropsChange={props.onCameraPropsChange}
          authorViewState={props.authorViewState}
          onAuthorViewStateChange={props.onAuthorViewStateChange}
          onCameraPathEaseChange={props.onCameraPathEaseChange}
          onSelectObject={props.onSelectObject}
          onObjectTransformChange={props.onObjectTransformChange}
          onContextMenu={props.onAuthorPreviewContextMenu}
          localTime={props.localTime}
          renderComposition={renderComposition}
          pipBackendProps={pipBackendProps}
        />
      </div>
    );
  }

  return backendNode;
});
