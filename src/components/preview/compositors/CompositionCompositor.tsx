import {
  memo,
  useRef,
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
import { CAMERA_PERSPECTIVE } from "../../../core/camera";
import { useCompositionCache } from "../cache/useCompositionCache";
import { renderCompositionPreview } from "../render/sceneRender";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../../../core/types";
import type { ComposeDrawTool, ExportTileFrameBounds } from "../FramePreview";
import { ComposeAuthorView } from "../three/ComposeAuthorView";
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
  cameraPreviewOverride?: CameraObjectProps | null;
  isPostProcessSource?: boolean;
};

export const CompositionCompositor = memo(function CompositionCompositor(
  props: CompositionCompositorProps,
) {
  const compositionRef = useRef<HTMLDivElement | null>(null);
  const pipBackendRef = useRef<HTMLDivElement | null>(null);
  const pipPostProcessSourceRef = useRef<HTMLDivElement | null>(null);
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

  const backendNode = (
    <Backend
      active={props.active}
      isPostProcessSource={props.isPostProcessSource}
      cameraPreviewOverride={props.cameraPreviewOverride}
      activeShapeTool={showAuthorView ? null : props.activeShapeTool}
      animationsEnabled={props.animationsEnabled}
      cameraHandledExternally={showAuthorView}
      canSelect={showAuthorView ? false : props.canSelect}
      duration={composition.duration}
      editingTextObjectId={showAuthorView ? null : props.editingTextObjectId}
      exportTileFrameBounds={props.exportTileFrameBounds}
      focusPicking={showAuthorView ? false : props.focusPicking}
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

  // PIP renders a second, fully-sealed DomBackend instance so the same
  // React subtree isn't portaled into two CSS3D targets at once. All
  // interactions are forced off; the PIP is preview-only. Camera is
  // handled by the through-camera Three.js renderer that hosts this
  // backend, so the DOM tree must NOT apply its own CSS camera transform.
  const pipBackendNode = (
    <DomBackend
      active={false}
      activeShapeTool={null}
      animationsEnabled={props.animationsEnabled}
      cameraPreviewOverride={props.cameraPreviewOverride}
      cameraHandledExternally={true}
      canSelect={false}
      duration={composition.duration}
      editingTextObjectId={null}
      exportTileFrameBounds={props.exportTileFrameBounds}
      focusPicking={false}
      frameScale={props.frameScale}
      hideNullObjects={props.hideNullObjects ?? false}
      hostRef={pipBackendRef}
      isPlaying={props.isPlaying}
      localTime={composition.localTime}
      part={props.part}
      renderClockSceneTime={props.renderClockSceneTime}
      renderMode={props.renderMode}
      onObjectPointerDown={NOOP_OBJECT_POINTER}
      onObjectContextMenu={undefined}
      onTextEditCommit={NOOP_TEXT_COMMIT}
      onTextEditEnd={undefined}
      onTextObjectDoubleClick={NOOP_OBJECT_DOUBLE_CLICK}
    />
  );

  const pipPostProcessSourceNode = (
    <div
      className="absolute left-0 top-0 overflow-hidden"
      data-clipper-frame-content
      style={{
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        background: props.part.frame.style.backgroundColor ?? "#000",
      }}
    >
      <div
        className="absolute inset-0"
        data-clipper-perspective-stage
        style={{
          perspective: `${CAMERA_PERSPECTIVE}px`,
          perspectiveOrigin: "center",
          transformStyle: "preserve-3d",
        }}
      >
        <DomBackend
          active={false}
          activeShapeTool={null}
          animationsEnabled={props.animationsEnabled}
          cameraPreviewOverride={props.cameraPreviewOverride}
          cameraHandledExternally={false}
          canSelect={false}
          duration={composition.duration}
          editingTextObjectId={null}
          exportTileFrameBounds={props.exportTileFrameBounds}
          focusPicking={false}
          frameScale={1}
          hideNullObjects={props.hideNullObjects ?? false}
          hostRef={pipPostProcessSourceRef}
          isPlaying={props.isPlaying}
          localTime={composition.localTime}
          part={props.part}
          renderClockSceneTime={props.renderClockSceneTime}
          renderMode={props.renderMode}
          onObjectPointerDown={NOOP_OBJECT_POINTER}
          onObjectContextMenu={undefined}
          onTextEditCommit={NOOP_TEXT_COMMIT}
          onTextEditEnd={undefined}
          onTextObjectDoubleClick={NOOP_OBJECT_DOUBLE_CLICK}
        />
      </div>
    </div>
  );

  if (showAuthorView && props.onCameraPropsChange) {
    return (
      <div className="absolute inset-0">
        <ComposeAuthorView
          part={props.part}
          selectedObjectId={props.selectedObjectId ?? null}
          onCameraPropsChange={props.onCameraPropsChange}
          onCameraPathEaseChange={props.onCameraPathEaseChange}
          onSelectObject={props.onSelectObject}
          localTime={props.localTime}
          renderComposition={() => backendNode}
          renderPipComposition={() => pipBackendNode}
          renderPipPostProcessSource={() => pipPostProcessSourceNode}
        />
      </div>
    );
  }

  return backendNode;
});

const NOOP_OBJECT_POINTER: CompositionCompositorProps["onObjectPointerDown"] =
  () => {};
const NOOP_TEXT_COMMIT: CompositionCompositorProps["onTextEditCommit"] =
  () => {};
const NOOP_OBJECT_DOUBLE_CLICK: CompositionCompositorProps["onTextObjectDoubleClick"] =
  () => {};
