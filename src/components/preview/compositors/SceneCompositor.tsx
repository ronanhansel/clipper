import {
  memo,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import type { CameraPreviewTransform } from "../../../core/camera";
import type { TimelinePreviewStackPart } from "../../../core/timeline";
import type {
  AdjustmentLayer,
  Bounds,
  FrameObject,
  RichTextSegment,
} from "../../../core/types";
import type { TransitionSequenceStyle } from "../../../core/effects/types";
import {
  FramePreviewRenderBoundary,
  TransitionCompositeView,
  type ComposeDrawTool,
  type ExportTileFrameBounds,
} from "../FramePreview";
import { CompositionCompositor } from "./CompositionCompositor";
import { renderScenePreview } from "../render/sceneRender";

type SceneCompositorProps = {
  cameraRef: RefObject<HTMLDivElement | null>;
  filePath: string;
  resetKey: string;
  sceneCamera: CameraPreviewTransform;
  visualAdjustmentStyle: CSSProperties;
  transitionCameraStyle: CSSProperties | undefined;
  frameVisualAdjustmentOverlaysRef: RefObject<HTMLDivElement | null>;
  transitionPreviewParts: {
    from: TimelinePreviewStackPart[];
    to: TimelinePreviewStackPart[];
    fromSceneTime: number;
    toSceneTime: number;
  } | null;
  transitionProgress: number | null;
  transitionSequenceStyle: TransitionSequenceStyle | undefined;
  stackPreviewParts: TimelinePreviewStackPart[];
  activePartId: string;
  renderMode: "preview" | "export";
  isPlaying: boolean;
  animationsEnabled: boolean;
  frameScale: number;
  exportTileFrameBounds?: ExportTileFrameBounds;
  adjustmentLayers: AdjustmentLayer[] | undefined;
  displaySceneTime: number;
  canSelect: boolean;
  activeShapeTool: ComposeDrawTool | null | undefined;
  editingTextObjectId: string | null;
  hideNullObjects: boolean;
  focusPicking: boolean;
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
};

export const SceneCompositor = memo(function SceneCompositor({
  cameraRef,
  filePath,
  resetKey,
  sceneCamera,
  visualAdjustmentStyle,
  transitionCameraStyle,
  frameVisualAdjustmentOverlaysRef,
  transitionPreviewParts,
  transitionProgress,
  transitionSequenceStyle,
  stackPreviewParts,
  activePartId,
  renderMode,
  isPlaying,
  animationsEnabled,
  frameScale,
  exportTileFrameBounds,
  adjustmentLayers,
  displaySceneTime,
  canSelect,
  activeShapeTool,
  editingTextObjectId,
  hideNullObjects,
  focusPicking,
  onObjectPointerDown,
  onObjectContextMenu,
  onTextEditCommit,
  onTextEditEnd,
  onTextObjectDoubleClick,
}: SceneCompositorProps) {
  useLayoutEffect(() => {
    const element = cameraRef.current;
    if (!element) return;
    const result = renderScenePreview({
      sceneCamera,
      visualAdjustmentFilter: undefined,
      transitionVisual: undefined,
      visualOverlays: undefined,
      useTransitionComposite: false,
      viewport: { width: 0, height: 0 },
      frameScale: 1,
    });
    element.style.transform = result.cameraTransform;
    element.style.filter = result.cameraFilter ?? "";
    const extra = transitionCameraStyle?.transform;
    if (typeof extra === "string" && extra.length > 0) {
      element.style.transform = `${element.style.transform} ${extra}`.trim();
    }
  }, [cameraRef, sceneCamera, transitionCameraStyle]);

  const cameraDivStyle: CSSProperties = { transformStyle: "preserve-3d" };
  if (transitionCameraStyle) {
    for (const [key, value] of Object.entries(transitionCameraStyle)) {
      if (key === "transform") continue;
      (cameraDivStyle as Record<string, unknown>)[key] = value;
    }
  }

  return (
    <div
      className="absolute inset-0 origin-center"
      ref={cameraRef}
      style={cameraDivStyle}
    >
      <div
        className="absolute inset-0"
        data-clipper-visual-adjustments
        style={visualAdjustmentStyle}
      >
        <FramePreviewRenderBoundary filePath={filePath} resetKey={resetKey}>
          {transitionPreviewParts && transitionProgress !== null ? (
            <TransitionCompositeView
              adjustmentLayers={adjustmentLayers}
              animationsEnabled={animationsEnabled}
              exportTileFrameBounds={exportTileFrameBounds}
              frameScale={frameScale}
              isPlaying={isPlaying}
              renderMode={renderMode}
              sequenceStyle={transitionSequenceStyle}
              transitionPreviewParts={transitionPreviewParts}
            />
          ) : (
            stackPreviewParts.map((item) => (
              <CompositionCompositor
                key={`${item.part.id}:${item.start}`}
                active={item.part.id === activePartId}
                activeShapeTool={activeShapeTool}
                animationsEnabled={animationsEnabled}
                canSelect={canSelect}
                editingTextObjectId={editingTextObjectId}
                exportTileFrameBounds={exportTileFrameBounds}
                focusPicking={focusPicking}
                frameScale={frameScale}
                hideNullObjects={hideNullObjects}
                isPlaying={isPlaying}
                part={item.part}
                localTime={item.previewTime}
                duration={item.part.duration}
                renderClockSceneTime={displaySceneTime}
                renderMode={renderMode}
                onObjectPointerDown={onObjectPointerDown}
                onObjectContextMenu={onObjectContextMenu}
                onTextEditCommit={onTextEditCommit}
                onTextEditEnd={onTextEditEnd}
                onTextObjectDoubleClick={onTextObjectDoubleClick}
              />
            ))
          )}
        </FramePreviewRenderBoundary>
        <div
          ref={frameVisualAdjustmentOverlaysRef}
          className="pointer-events-none absolute inset-0"
          data-clipper-visual-adjustment-overlays="frame"
          style={{ zIndex: 2147483647 }}
        />
      </div>
    </div>
  );
});
