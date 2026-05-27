import {
  memo,
  useLayoutEffect,
  useMemo,
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
  prewarmParts?: TimelinePreviewStackPart[];
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
  prewarmParts,
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
  const mountedSlotsRef = useRef<
    Array<{ key: string; part: CompositionClip; start: number }>
  >([]);

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

  const frameStyle = transitionSequenceStyle?.frameStyle as
    | CSSProperties
    | undefined;
  const aStyle = transitionSequenceStyle?.aStyle as CSSProperties | undefined;
  const bStyle = transitionSequenceStyle?.bStyle as CSSProperties | undefined;

  const visibleItems = useMemo(() => {
    const items: Array<{
      part: CompositionClip;
      start: number;
      previewTime: number;
      role: "active" | "from" | "to";
      sceneTime: number;
    }> = [];
    if (useDomTransitionComposite && transitionPreviewParts) {
      if (transitionPreviewParts.from[0]) {
        items.push({
          part: transitionPreviewParts.from[0].part,
          start: transitionPreviewParts.from[0].start,
          previewTime: transitionPreviewParts.from[0].previewTime,
          role: "from",
          sceneTime: transitionPreviewParts.fromSceneTime,
        });
      }
      if (transitionPreviewParts.to[0]) {
        items.push({
          part: transitionPreviewParts.to[0].part,
          start: transitionPreviewParts.to[0].start,
          previewTime: transitionPreviewParts.to[0].previewTime,
          role: "to",
          sceneTime: transitionPreviewParts.toSceneTime,
        });
      }
    } else if (flattenComposition && stackPreviewParts.length === 1) {
      items.push({
        part: stackPreviewParts[0].part,
        start: stackPreviewParts[0].start,
        previewTime: stackPreviewParts[0].previewTime,
        role: "active",
        sceneTime: displaySceneTime,
      });
    }
    return items;
  }, [
    useDomTransitionComposite,
    transitionPreviewParts,
    stackPreviewParts,
    displaySceneTime,
    flattenComposition,
  ]);

  const mountedSlots = useMemo(() => {
    const previous = mountedSlotsRef.current;
    const nextSlots: Array<{
      key: string;
      part: CompositionClip;
      start: number;
    }> = [];
    const seenKeys = new Set<string>();

    // 1. Keep visible items first
    for (const item of visibleItems) {
      const key = `${item.part.id}:${item.start}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      nextSlots.push({
        key,
        part: item.part,
        start: item.start,
      });
    }

    // 2. Keep prewarm parts
    if (prewarmParts) {
      for (const item of prewarmParts) {
        const key = `${item.part.id}:${item.start}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        nextSlots.push({
          key,
          part: item.part,
          start: item.start,
        });
      }
    }

    // 3. Keep recently visible items (cap at 4)
    const maxSlots = 4;
    for (const slot of previous) {
      if (nextSlots.length >= maxSlots) break;
      if (seenKeys.has(slot.key)) continue;
      seenKeys.add(slot.key);
      nextSlots.push(slot);
    }

    mountedSlotsRef.current = nextSlots;
    return nextSlots;
  }, [visibleItems, prewarmParts]);

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
          {flattenComposition ? (
            <div
              className="absolute inset-0 overflow-hidden"
              style={useDomTransitionComposite ? frameStyle : undefined}
            >
              {mountedSlots.map((slot) => {
                const visibleItem = visibleItems.find(
                  (item) => `${item.part.id}:${item.start}` === slot.key,
                );
                const isVisible = Boolean(visibleItem);

                let slotStyle: CSSProperties = {
                  position: "absolute",
                  inset: 0,
                };
                if (!visibleItem) {
                  slotStyle = {
                    ...slotStyle,
                    display: "none",
                  };
                } else if (visibleItem.role === "from") {
                  slotStyle = {
                    ...slotStyle,
                    ...aStyle,
                    willChange:
                      renderMode === "export" ? undefined : "transform",
                  };
                } else if (visibleItem.role === "to") {
                  slotStyle = {
                    ...slotStyle,
                    ...bStyle,
                    willChange:
                      renderMode === "export" ? undefined : "transform",
                  };
                }

                const prewarmItem = prewarmParts?.find(
                  (item) => `${item.part.id}:${item.start}` === slot.key,
                );

                return (
                  <div
                    key={slot.key}
                    style={slotStyle}
                    aria-hidden={isVisible ? undefined : true}
                  >
                    <DirectCompositionGpuHost
                      part={slot.part}
                      localTime={
                        visibleItem
                          ? visibleItem.previewTime
                          : prewarmItem
                            ? prewarmItem.previewTime
                            : 0
                      }
                      sourceSlots={
                        visibleItem
                          ? [visibleItem]
                          : prewarmItem
                            ? [prewarmItem]
                            : undefined
                      }
                      backendProps={{
                        animationsEnabled: isVisible
                          ? animationsEnabled
                          : false,
                        frameScale,
                        previewFps,
                        hideNullObjects,
                        isPlaying: isVisible ? isPlaying : false,
                        duration: slot.part.duration,
                        renderClockSceneTime: visibleItem
                          ? visibleItem.sceneTime
                          : prewarmItem
                            ? slot.start + prewarmItem.previewTime
                            : displaySceneTime,
                        renderMode,
                        exportTileFrameBounds,
                      }}
                      adjustmentLayers={adjustmentLayers}
                      transitionLayers={transitionLayers}
                      hostClassName="pointer-events-none absolute inset-0"
                    />
                  </div>
                );
              })}
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
