import {
  useEffect,
  memo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
} from "react";
import type {
  Bounds,
  CameraObjectProps,
  CompositionClip,
  FrameObject,
  RichTextSegment,
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

type CompositionCompositorProps = {
  active: boolean;
  activeShapeTool?: ComposeDrawTool | null;
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
  hideNullObjects?: boolean;
  isPlaying: boolean;
  part: CompositionClip;
  localTime: number;
  duration: number;
  renderClockSceneTime: number;
  renderMode: "preview" | "export";
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
  const composition = renderCompositionPreview({
    composition: props.part,
    localTime: props.localTime,
    duration: props.duration,
    viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    frameScale: props.frameScale,
  });
  const Backend: CompositionBackend = props.flatten
    ? RasterBackend
    : DomBackend;
  const showAuthorView =
    !props.flatten &&
    Boolean(props.onCameraPropsChange) &&
    compositionHasCameraLayer(props.part);
  const [previewMode, setPreviewMode] = useState<CameraPreviewMode>(
    props.authorViewState?.previewMode ?? "pip",
  );
  const cameraHandledExternally = showAuthorView && previewMode !== "2d";
  useEffect(() => {
    if (!props.authorViewState) return;
    setPreviewMode(props.authorViewState.previewMode);
  }, [props.authorViewState]);
  const handlePreviewModeChange = (mode: CameraPreviewMode) => {
    setPreviewMode(mode);
    props.onAuthorPreviewModeChange?.(mode);
  };
  const authoringInteractionsEnabled = !showAuthorView || previewMode === "2d";

  const backendNode = (
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
      hideNullObjects={props.hideNullObjects ?? false}
      hostRef={compositionRef}
      isPlaying={props.isPlaying}
      localTime={composition.localTime}
      part={props.part}
      renderClockSceneTime={props.renderClockSceneTime}
      renderMode={props.renderMode}
      onObjectPointerDown={props.onObjectPointerDown}
      onObjectContextMenu={props.onObjectContextMenu}
      onTextEditCommit={props.onTextEditCommit}
      onTextEditEnd={props.onTextEditEnd}
      onTextObjectDoubleClick={props.onTextObjectDoubleClick}
    />
  );

  if (showAuthorView && props.onCameraPropsChange) {
    return (
      <div className="absolute inset-0">
        <ComposeAuthorView
          part={props.part}
          selectedObjectId={props.selectedObjectId ?? null}
          onCameraPropsChange={props.onCameraPropsChange}
          onPreviewModeChange={handlePreviewModeChange}
          authorViewState={props.authorViewState}
          onAuthorViewStateChange={props.onAuthorViewStateChange}
          onCameraPathEaseChange={props.onCameraPathEaseChange}
          onSelectObject={props.onSelectObject}
          onObjectTransformChange={props.onObjectTransformChange}
          localTime={props.localTime}
          renderComposition={() => backendNode}
          pipBackendProps={{
            animationsEnabled: props.animationsEnabled,
            frameScale: props.frameScale,
            hideNullObjects: props.hideNullObjects ?? false,
            isPlaying: props.isPlaying,
            duration: composition.duration,
            renderClockSceneTime: props.renderClockSceneTime,
            renderMode: props.renderMode,
            exportTileFrameBounds: props.exportTileFrameBounds,
          }}
        />
      </div>
    );
  }

  return backendNode;
});
