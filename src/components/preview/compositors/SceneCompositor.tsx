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
  CameraObjectProps,
  CompositionClip,
  FrameObject,
  RichTextSegment,
  TransitionLayer,
} from "../../../core/types";
import type { TransitionSequenceStyle } from "../../../core/effects/types";
import {
  FramePreviewRenderBoundary,
  TransitionCompositeView,
  type ComposeDrawTool,
  type ExportTileFrameBounds,
} from "../FramePreview";
import { CompositionCompositor } from "./CompositionCompositor";
import type {
  CameraPreviewMode,
  ComposeAuthorViewState,
} from "../three/ComposeAuthorView";
import type { PreviewFps } from "../../../core/previewFps";
import { renderScenePreview } from "../render/sceneRender";
import {
  DirectCompositionGpuHost,
  type DirectGpuTransitionComposite,
} from "../three/DirectCompositionGpuHost";

const hiddenKeepMountedDirectHostStyle: CSSProperties = {
  display: "none",
};

type SceneCompositorProps = {
  isPostProcessSource?: boolean;
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
  previewFps: PreviewFps;
  exportTileFrameBounds?: ExportTileFrameBounds;
  adjustmentLayers: AdjustmentLayer[] | undefined;
  transitionLayers: TransitionLayer[] | undefined;
  displaySceneTime: number;
  canSelect: boolean;
  activeShapeTool: ComposeDrawTool | null | undefined;
  handToolActive?: boolean;
  editingTextObjectId: string | null;
  hideNullObjects: boolean;
  flattenComposition: boolean;
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
};

type DirectGpuHostInput = {
  part: CompositionClip;
  localTime: number;
  sourceSlots: TimelinePreviewStackPart[];
  backendProps: {
    animationsEnabled: boolean;
    frameScale: number;
    previewFps: PreviewFps;
    hideNullObjects: boolean;
    isPlaying: boolean;
    duration: number;
    renderClockSceneTime: number;
    renderMode: "preview" | "export";
    exportTileFrameBounds?: ExportTileFrameBounds;
  };
  transitionComposite: DirectGpuTransitionComposite | null;
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
  previewFps,
  exportTileFrameBounds,
  adjustmentLayers,
  transitionLayers,
  displaySceneTime,
  canSelect,
  activeShapeTool,
  handToolActive = false,
  editingTextObjectId,
  hideNullObjects,
  flattenComposition,
  focusPicking,
  onObjectPointerDown,
  onObjectContextMenu,
  onTextEditCommit,
  onTextEditEnd,
  onTextObjectDoubleClick,
  selectedObjectId,
  onCameraPropsChange,
  onCameraPathEaseChange,
  onSelectObject,
  onAuthorPreviewModeChange,
  authorViewState,
  onAuthorViewStateChange,
  onObjectTransformChange,
  onAuthorPreviewContextMenu,
  isPostProcessSource,
}: SceneCompositorProps) {
  const lastDirectGpuHostInputRef = useRef<DirectGpuHostInput | null>(null);
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

  const useDomTransitionComposite = shouldUseDomTransitionComposite({
    flattenComposition,
    hasTransitionPreviewParts: Boolean(transitionPreviewParts),
    transitionProgress,
  });
  const currentDirectGpuHostInput =
    flattenComposition &&
    !transitionPreviewParts &&
    stackPreviewParts.length === 1
      ? {
          part: stackPreviewParts[0].part,
          localTime: stackPreviewParts[0].previewTime,
          sourceSlots: stackPreviewParts,
          backendProps: {
            animationsEnabled,
            frameScale,
            previewFps,
            hideNullObjects,
            isPlaying,
            duration: stackPreviewParts[0].part.duration,
            renderClockSceneTime: displaySceneTime,
            renderMode,
            exportTileFrameBounds,
          },
          transitionComposite: null,
        }
      : null;
  if (currentDirectGpuHostInput) {
    lastDirectGpuHostInputRef.current = currentDirectGpuHostInput;
  }
  const directGpuHostInput =
    currentDirectGpuHostInput ??
    (flattenComposition && !useDomTransitionComposite
      ? lastDirectGpuHostInputRef.current
      : null);

  return (
    <div
      className="absolute inset-0 origin-center"
      ref={cameraRef}
      style={cameraDivStyle}
    >
      <div
        className="absolute inset-0"
        data-clipper-visual-adjustments
        style={{
          ...(visualAdjustmentStyle ?? {}),
          // Propagate the perspective stage's 3D context through this
          // adjustments wrapper so descendant `translateZ` / `rotateX/Y/Z`
          // keep their depth. Without this, CSS flattens the subtree at
          // this level even when the parent declares preserve-3d.
          transformStyle: "preserve-3d",
        }}
      >
        <FramePreviewRenderBoundary filePath={filePath} resetKey={resetKey}>
          {directGpuHostInput ? (
            <div
              className="absolute inset-0"
              style={
                currentDirectGpuHostInput
                  ? undefined
                  : hiddenKeepMountedDirectHostStyle
              }
              aria-hidden={currentDirectGpuHostInput ? undefined : true}
            >
              <DirectCompositionGpuHost
                part={directGpuHostInput.part}
                localTime={directGpuHostInput.localTime}
                sourceSlots={directGpuHostInput.sourceSlots}
                backendProps={directGpuHostInput.backendProps}
                adjustmentLayers={adjustmentLayers}
                transitionLayers={transitionLayers}
                transitionComposite={directGpuHostInput.transitionComposite}
                hostClassName="pointer-events-none absolute inset-0"
              />
            </div>
          ) : useDomTransitionComposite ? (
            <TransitionCompositeView
              adjustmentLayers={adjustmentLayers}
              animationsEnabled={animationsEnabled}
              exportTileFrameBounds={exportTileFrameBounds}
              flattenComposition={false}
              frameScale={frameScale}
              isPlaying={isPlaying}
              renderMode={renderMode}
              sequenceStyle={transitionSequenceStyle}
              transitionLayers={transitionLayers}
              transitionPreviewParts={transitionPreviewParts!}
            />
          ) : (
            stackPreviewParts.map((item) => (
              <CompositionCompositor
                key={`${item.part.id}:${item.start}`}
                isPostProcessSource={isPostProcessSource}
                active={item.part.id === activePartId}
                activeShapeTool={activeShapeTool}
                handToolActive={handToolActive}
                animationsEnabled={animationsEnabled}
                canSelect={canSelect}
                editingTextObjectId={editingTextObjectId}
                exportTileFrameBounds={exportTileFrameBounds}
                flatten={flattenComposition}
                focusPicking={focusPicking}
                frameScale={frameScale}
                previewFps={previewFps}
                hideNullObjects={hideNullObjects}
                isPlaying={isPlaying}
                part={item.part}
                localTime={item.previewTime}
                duration={item.part.duration}
                renderClockSceneTime={displaySceneTime}
                renderMode={renderMode}
                adjustmentLayers={adjustmentLayers}
                transitionLayers={transitionLayers}
                onObjectPointerDown={onObjectPointerDown}
                onObjectContextMenu={onObjectContextMenu}
                onTextEditCommit={onTextEditCommit}
                onTextEditEnd={onTextEditEnd}
                onTextObjectDoubleClick={onTextObjectDoubleClick}
                selectedObjectId={selectedObjectId}
                onCameraPropsChange={onCameraPropsChange}
                onCameraPathEaseChange={onCameraPathEaseChange}
                onSelectObject={onSelectObject}
                onAuthorPreviewModeChange={onAuthorPreviewModeChange}
                authorViewState={authorViewState}
                onAuthorViewStateChange={onAuthorViewStateChange}
                onObjectTransformChange={onObjectTransformChange}
                onAuthorPreviewContextMenu={onAuthorPreviewContextMenu}
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

export function shouldUseDomTransitionComposite(input: {
  flattenComposition: boolean;
  hasTransitionPreviewParts: boolean;
  transitionProgress: number | null;
}) {
  return input.hasTransitionPreviewParts && input.transitionProgress !== null;
}

export function shouldUseRenderedLayerTransitionComposite(input: {
  flattenComposition: boolean;
  hasTransitionPreviewParts: boolean;
  hasGpuTransitionComposite: boolean;
  hasTransitionPostProcessPasses: boolean;
  transitionProgress: number | null;
}) {
  return (
    input.flattenComposition &&
    input.hasTransitionPreviewParts &&
    input.transitionProgress !== null &&
    input.hasGpuTransitionComposite &&
    !input.hasTransitionPostProcessPasses
  );
}

export function shouldUseDirectGpuTransitionComposite(input: {
  flattenComposition: boolean;
  hasTransitionPreviewParts: boolean;
  hasGpuTransitionComposite: boolean;
  hasTransitionPostProcessPasses: boolean;
  transitionProgress: number | null;
  fromPartCount: number;
  toPartCount: number;
}) {
  void input;
  return false;
}
