import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent, type RefObject, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { selectorBlue, selectorHandleSizePx, selectorOffsetPx } from "../../app/config";
import { getRenderableTextSegments, getSelectionFormatState, normalizeEditableFormatting, renderRichTextSegments, richTextSegmentsFromElement, shouldPersistRichText, textSegmentsToEditableNodes } from "../../app/richText";
import { applyAdjustmentLayersToVisualStyle } from "../../core/adjustments";
import { boundsToViewport, formatCameraPreviewTransform, getLayeredCameraPreviewTransform, type CameraPreviewTransform } from "../../core/camera";
import { generateChartObjects, type ChartGeneratedObject } from "../../core/chart";
import { getBoundsUnion, insetBounds, isVisibleMarqueeBounds, updateDragSelectionBoxElement, type ResizeHandle } from "../../core/frameInteraction";
import { clamp } from "../../core/math";
import { getRenderClockAttributes, getRenderClockStyle, syncDomAnimationsToRenderClock } from "../../render-engine/renderClock";
import { evaluateBackgroundLayer, evaluateFrameObject, isTimeSensitiveFrameObject, type EvaluatedFrameObject } from "../../render-engine/renderRuntime";
import { applyTransitionLayersToVisualStyle, getTransitionFinishTime, getTransitionProgress, renderTransitionSequence } from "../../core/transitions";
import { FRAME_HEIGHT, FRAME_WIDTH, type AdjustmentLayer, type BackgroundLayer, type Bounds, type FrameObject, type Part, type Point, type RichTextSegment, type SelectionPayload, type TimelineMode, type TimelineMotionLayerState, type TransitionLayer } from "../../core/types";
import type { AdjustmentVisualOverlay, TransitionSequenceStyle, TransitionVisualOverlay } from "../../core/effects/types";
import type { PlaybackClock } from "../../app/types";

const identityCameraTransform: CameraPreviewTransform = { x: 0, y: 0, z: 0, scale: 1, rotation: 0, rotateX: 0, rotateY: 0, perspective: 1800 };

export const FramePreview = memo(function FramePreview({ cameraRef, dragBox, dragSelectionBoxRef, framePickPoint, focusPicking, trackerPicking, canSelectObjects, cameraTransform, frameViewportRef, frameScale, isPlaying, part, partStart, adjustmentLayers, playbackClock, previewTime, sceneTime, timelineMode, motionLayers, hiddenMotionLayerIds, pickingTranslationPosition, pickingZoomFocus, compHidden, selectedObjects, marqueeDragging, editingTextObjectId, onFramePointerCancel, onFramePointerDown, onFramePointerDownCapture, onFramePointerMove, onFramePointerUp, onObjectPointerDown, onObjectResizePointerDown, onTextEditCommit, onTextObjectDoubleClick, onTrackerTargetPick }: { cameraRef: RefObject<HTMLDivElement | null>; dragBox: Bounds | null; dragSelectionBoxRef: RefObject<HTMLDivElement | null>; framePickPoint: Point | null; focusPicking: boolean; trackerPicking: boolean; canSelectObjects: boolean; cameraTransform: CameraPreviewTransform; frameViewportRef: RefObject<HTMLDivElement | null>; frameScale: number; isPlaying: boolean; part: Part; partStart: number; adjustmentLayers?: AdjustmentLayer[]; playbackClock: PlaybackClock; previewTime: number; sceneTime: number; timelineMode: TimelineMode; motionLayers: TimelineMotionLayerState[]; hiddenMotionLayerIds?: Set<string>; pickingTranslationPosition: boolean; pickingZoomFocus: boolean; compHidden?: boolean; selectedObjects: SelectionPayload["objects"]; marqueeDragging: boolean; editingTextObjectId: string | null; onFramePointerCancel: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerDown: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerDownCapture: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerMove: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerUp: (event: PointerEvent<HTMLDivElement>) => void; onObjectPointerDown: (event: PointerEvent<HTMLDivElement>, object: FrameObject) => void; onObjectResizePointerDown: (event: PointerEvent<HTMLDivElement>, handle: ResizeHandle, objectId?: string) => void; onTextEditCommit: (objectId: string, content: string, richText?: RichTextSegment[]) => void; onTextObjectDoubleClick: (event: ReactMouseEvent<HTMLDivElement>, object: FrameObject) => void; onTrackerTargetPick: (objectId: string) => void }) {
  const viewportStyle = useMemo(() => ({ width: FRAME_WIDTH * frameScale, height: FRAME_HEIGHT * frameScale }) as CSSProperties, [frameScale]);
  const selectionBleedPx = selectorOffsetPx + selectorHandleSizePx;
  const viewportOverlayStyle = useMemo(() => ({ width: FRAME_WIDTH * frameScale + selectionBleedPx * 2, height: FRAME_HEIGHT * frameScale + selectionBleedPx * 2, margin: -selectionBleedPx }) as CSSProperties, [frameScale, selectionBleedPx]);
  const clippedViewportStyle = useMemo(() => ({ ...viewportStyle, left: selectionBleedPx, top: selectionBleedPx }) as CSSProperties, [selectionBleedPx, viewportStyle]);
  const animationsEnabled = true;
  const previewParts = (arguments[0] as { previewParts?: Array<{ part: Part; start: number; previewTime: number }> }).previewParts;
  const transitionPreviewParts = (arguments[0] as { transitionPreviewParts?: { from: Array<{ part: Part; start: number; previewTime: number }>; to: Array<{ part: Part; start: number; previewTime: number }>; fromSceneTime: number; toSceneTime: number } | null }).transitionPreviewParts;
  const transitionLayers = (arguments[0] as { transitionLayers?: TransitionLayer[] }).transitionLayers;
  const renderMode = (arguments[0] as { renderMode?: "preview" | "export" }).renderMode ?? "preview";
  const displayPreviewTime = previewTime;
  const displaySceneTime = sceneTime;
  const visualAdjustment = useMemo(() => applyAdjustmentLayersToVisualStyle(displaySceneTime, adjustmentLayers), [adjustmentLayers, displaySceneTime]);
  const visualTransition = useMemo(() => applyTransitionLayersToVisualStyle(displaySceneTime, transitionLayers), [displaySceneTime, transitionLayers]);
  const activeTransitionLayer = getActiveTransitionLayer(displaySceneTime, transitionLayers);
  const transitionProgress = activeTransitionLayer ? getTransitionProgress(displaySceneTime, activeTransitionLayer) : null;
  const transitionSequenceStyle = useMemo(() => activeTransitionLayer ? renderTransitionSequence(displaySceneTime, activeTransitionLayer) : undefined, [activeTransitionLayer, displaySceneTime]);
  const useTransitionComposite = Boolean(transitionPreviewParts && activeTransitionLayer);
  const visualAdjustmentStyle = useMemo(() => ({ filter: [useTransitionComposite ? undefined : visualAdjustment.filter, visualTransition.filter].filter(Boolean).join(" ") || undefined, ...visualTransition.frameStyle }) as CSSProperties, [useTransitionComposite, visualAdjustment.filter, visualTransition.filter, visualTransition.frameStyle]);
  const transitionCameraStyle = useMemo(() => (useTransitionComposite ? undefined : visualTransition.cameraStyle) as CSSProperties | undefined, [useTransitionComposite, visualTransition.cameraStyle]);
  const frameVisualAdjustmentOverlaysRef = useRef<HTMLDivElement | null>(null);
  const cameraVisualAdjustmentOverlaysRef = useRef<HTMLDivElement | null>(null);
  const activeCameraTransform = useMemo(() => {
    if (timelineMode !== "composition") return cameraTransform;
    return getLayeredCameraPreviewTransform(part, motionLayers, displayPreviewTime, { hiddenLayerIds: hiddenMotionLayerIds, pickingTranslationPosition, pickingZoomFocus, resetMotionEffects: trackerPicking || focusPicking || pickingTranslationPosition || pickingZoomFocus });
  }, [cameraTransform, displayPreviewTime, focusPicking, hiddenMotionLayerIds, motionLayers, part, pickingTranslationPosition, pickingZoomFocus, timelineMode, trackerPicking]);
  const liveCameraTransform = useTransitionComposite ? identityCameraTransform : activeCameraTransform;
  const frameStyle = useMemo(() => ({ width: FRAME_WIDTH, height: FRAME_HEIGHT, background: "#000", transform: `scale(${frameScale})` }) as CSSProperties, [frameScale]);
  const perspectiveStageStyle = useMemo(() => ({ perspective: `${liveCameraTransform.perspective}px`, perspectiveOrigin: "center", transformStyle: "preserve-3d" }) as CSSProperties, [liveCameraTransform.perspective]);
  const selectedBounds = useMemo(() => selectedObjects.length > 0 ? getBoundsUnion(selectedObjects.map((object) => object.bounds)) : null, [selectedObjects]);
  const selectedViewportBounds = useMemo(() => selectedBounds ? insetBounds(boundsToViewport(selectedBounds, liveCameraTransform, frameScale), -selectorOffsetPx) : null, [frameScale, liveCameraTransform, selectedBounds]);
  const [trackerHoverTarget, setTrackerHoverTarget] = useState<{ id: string; viewportBounds: Bounds } | null>(null);
  const [selectorHover, setSelectorHover] = useState(false);
  const selectorHoverRef = useRef(false);
  const showDragBox = dragBox && isVisibleMarqueeBounds(dragBox, frameScale);
  const isUnlinkedPart = Boolean(part.sourceMissing);
  const compositionError = part.compositionError;
  const stackPreviewParts = previewParts?.length ? previewParts : [{ part, start: partStart, previewTime }];

  useEffect(() => {
    if (!cameraRef.current) return;
    const transitionTransform = typeof transitionCameraStyle?.transform === "string" ? transitionCameraStyle.transform : "";
    cameraRef.current.style.transform = `${transitionTransform} ${formatCameraPreviewTransform(liveCameraTransform)}`.trim();
  }, [cameraRef, liveCameraTransform, transitionCameraStyle]);

  useLayoutEffect(() => {
    const adjustmentOverlays = useTransitionComposite ? [] : visualAdjustment.overlays ?? [];
    syncVisualAdjustmentOverlays(frameVisualAdjustmentOverlaysRef.current, [...adjustmentOverlays.filter((overlay) => overlay.target === "frame"), ...(visualTransition.overlays?.filter((overlay) => overlay.target === "frame") ?? [])]);
    syncVisualAdjustmentOverlays(cameraVisualAdjustmentOverlaysRef.current, [...adjustmentOverlays.filter((overlay) => (overlay.target ?? "camera") === "camera"), ...(visualTransition.overlays?.filter((overlay) => (overlay.target ?? "camera") === "camera") ?? [])]);
  }, [useTransitionComposite, visualAdjustment.overlays, visualTransition.overlays]);

  useEffect(() => {
    if (!trackerPicking) setTrackerHoverTarget(null);
  }, [trackerPicking]);

  function updateSelectorHover(event: PointerEvent<HTMLDivElement>) {
    if (!selectedViewportBounds || marqueeDragging) {
      if (selectorHoverRef.current) {
        selectorHoverRef.current = false;
        setSelectorHover(false);
      }
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hovering = x >= selectedViewportBounds.x && x <= selectedViewportBounds.x + selectedViewportBounds.width && y >= selectedViewportBounds.y && y <= selectedViewportBounds.y + selectedViewportBounds.height;
    if (hovering === selectorHoverRef.current) return;
    selectorHoverRef.current = hovering;
    setSelectorHover(hovering);
  }

  function handleFramePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (isPlaying) return;
    if (trackerPicking) updateTrackerHover(event);
    updateSelectorHover(event);
    onFramePointerMove(event);
  }

  function handleFramePointerDownCapture(event: PointerEvent<HTMLDivElement>) {
    if (isPlaying) return;
    if (!trackerPicking) {
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
    setTrackerHoverTarget(target.id && target.viewportBounds ? { id: target.id, viewportBounds: target.viewportBounds } : null);
  }

  function getTrackerTargetFromPoint(event: PointerEvent<HTMLDivElement>) {
    const frameRect = frameViewportRef.current?.getBoundingClientRect();
    if (!frameRect) return { id: "", viewportBounds: null };

    for (const element of document.elementsFromPoint(event.clientX, event.clientY)) {
      const target = element instanceof HTMLElement ? element.closest<HTMLElement>("[data-object-id],[data-background-element-id]") : null;
      const id = target?.dataset.objectId ?? target?.dataset.backgroundElementId;
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

  function clearSelectorHover() {
    if (selectorHoverRef.current) {
      selectorHoverRef.current = false;
      setSelectorHover(false);
    }
    setTrackerHoverTarget(null);
  }

  return (
    <div data-clipper-frame-preview-wrapper>
      <div className="relative overflow-visible" data-clipper-frame-preview-shell style={viewportOverlayStyle}>
        <div ref={frameViewportRef} className={`absolute overflow-hidden bg-black shadow-[0_22px_70px_rgba(0,0,0,0.44)] ${!isPlaying && (focusPicking || trackerPicking) ? "cursor-crosshair ring-2 ring-[#159dff]" : ""}`} data-clipper-frame-preview style={clippedViewportStyle} onPointerDownCapture={handleFramePointerDownCapture} onPointerDown={isPlaying ? undefined : onFramePointerDown} onPointerMove={handleFramePointerMove} onPointerUp={isPlaying ? undefined : onFramePointerUp} onPointerCancel={isPlaying ? undefined : onFramePointerCancel} onPointerLeave={clearSelectorHover}>
          <div className="absolute left-0 top-0 origin-top-left overflow-hidden" data-clipper-frame-content style={frameStyle}>
            <div className="absolute inset-0" data-clipper-perspective-stage style={perspectiveStageStyle}>
              {isUnlinkedPart || compHidden || compositionError ? <div className="absolute inset-0 bg-black" ref={cameraRef}>{compositionError ? <CompositionErrorOverlay filePath={part.filePath} message={compositionError} /> : null}</div> : <div className="absolute inset-0 origin-center" ref={cameraRef} style={{ transformStyle: "preserve-3d", ...transitionCameraStyle }}>
                <div className="absolute inset-0" data-clipper-visual-adjustments style={visualAdjustmentStyle}>
                  {transitionPreviewParts && transitionProgress !== null
                    ? <TransitionCompositeView adjustmentLayers={adjustmentLayers} animationsEnabled={animationsEnabled} isPlaying={isPlaying} renderMode={renderMode} sequenceStyle={transitionSequenceStyle} transitionPreviewParts={transitionPreviewParts} />
                    : stackPreviewParts.map((item) => <CompositionLayerView key={`${item.part.id}:${item.start}`} active={item.part.id === part.id} animationsEnabled={animationsEnabled} canSelect={!isPlaying && (canSelectObjects || trackerPicking)} editingTextObjectId={editingTextObjectId} focusPicking={!isPlaying && (focusPicking || trackerPicking)} isPlaying={isPlaying} part={item.part} previewTime={item.previewTime} renderMode={renderMode} onObjectPointerDown={onObjectPointerDown} onTextEditCommit={onTextEditCommit} onTextObjectDoubleClick={onTextObjectDoubleClick} />)}
                  <div ref={frameVisualAdjustmentOverlaysRef} className="pointer-events-none absolute inset-0" data-clipper-visual-adjustment-overlays="frame" style={{ zIndex: 2147483647 }} />
                </div>
              </div>}
            </div>
            <div ref={cameraVisualAdjustmentOverlaysRef} className="pointer-events-none absolute inset-0" data-clipper-visual-adjustment-overlays="camera" style={{ zIndex: 2147483647 }} />
          </div>
          {trackerPicking && trackerHoverTarget ? <TrackerTargetOverlay target={trackerHoverTarget} /> : null}
          {dragBox ? <DragSelectionBox ref={dragSelectionBoxRef} bounds={dragBox} frameScale={frameScale} visible={Boolean(showDragBox)} /> : null}
          {focusPicking && framePickPoint ? <FramePickPointOverlay point={framePickPoint} frameScale={frameScale} /> : null}
        </div>
        {canSelectObjects && !isUnlinkedPart ? selectedObjects.map((object) => <SelectionOverlayBox key={object.id} objectId={object.id} bounds={object.bounds} cameraTransform={liveCameraTransform} frameScale={frameScale} highlighted={selectorHover} interactive={!marqueeDragging} overlayOffset={selectionBleedPx} onResizePointerDown={(event, handle) => onObjectResizePointerDown(event, handle, object.id)} />) : null}
      </div>
    </div>
  );
});

function CompositionErrorOverlay({ filePath, message }: { filePath: string; message: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#07090d] p-16 text-[#ffd6d6]">
      <div className="max-w-[1080px] rounded-[28px] border border-[#5a222c] bg-[#1a0f13]/95 p-10 shadow-[0_26px_90px_rgba(0,0,0,0.55)]">
        <div className="text-[22px] font-extrabold tracking-tight text-[#ff6b7a]">Composition failed to load</div>
        <div className="mt-2 break-all font-mono text-[15px] text-[#a7adbb]">{filePath}</div>
        <pre className="mt-6 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-[18px] border border-[#3b2a2a] bg-[#090b10] p-5 font-mono text-[20px] leading-relaxed text-[#ffd6d6]">{message}</pre>
      </div>
    </div>
  );
}

function syncVisualAdjustmentOverlays(container: HTMLElement | null, overlays: AdjustmentVisualOverlay[] | undefined) {
  if (!container) return;
  container.replaceChildren(...(overlays ?? []).map((overlay) => {
    const element = document.createElement("div");
    element.className = "pointer-events-none absolute inset-0";
    element.style.zIndex = "2147483647";
    Object.assign(element.style, overlay.style);
    return element;
  }));
}

function TrackerTargetOverlay({ target }: { target: { id: string; viewportBounds: Bounds } }) {
  const viewportBounds = insetBounds(target.viewportBounds, -selectorOffsetPx);

  return (
    <div className="pointer-events-none absolute border bg-[#159dff]/10 shadow-[0_0_0_1px_rgba(21,157,255,0.18)]" style={{ borderColor: selectorBlue, left: viewportBounds.x, top: viewportBounds.y, width: viewportBounds.width, height: viewportBounds.height, zIndex: 72 }}>
      <span className="absolute left-0 top-0 -translate-y-full whitespace-nowrap bg-[#159dff] px-1.5 py-0.5 text-[10px] font-normal leading-none text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)]">{target.id}</span>
    </div>
  );
}

function CompositionLayerView({ active, animationsEnabled, canSelect, editingTextObjectId, focusPicking, isPlaying, part, previewTime, renderMode, onObjectPointerDown, onTextEditCommit, onTextObjectDoubleClick }: { active: boolean; animationsEnabled: boolean; canSelect: boolean; editingTextObjectId: string | null; focusPicking: boolean; isPlaying: boolean; part: Part; previewTime: number; renderMode: "preview" | "export"; onObjectPointerDown: (event: PointerEvent<HTMLDivElement>, object: FrameObject) => void; onTextEditCommit: (objectId: string, content: string, richText?: RichTextSegment[]) => void; onTextObjectDoubleClick: (event: ReactMouseEvent<HTMLDivElement>, object: FrameObject) => void }) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const renderClockState = useMemo(() => ({ playing: renderMode !== "export" && isPlaying, time: previewTime, mode: renderMode }), [isPlaying, previewTime, renderMode]);
  const renderClockStateRef = useRef(renderClockState);
  const renderClockStyle = useMemo(() => getRenderClockStyle(renderClockState) as CSSProperties, [renderClockState]);

  useLayoutEffect(() => {
    renderClockStateRef.current = renderClockState;
    syncDomAnimationsToRenderClock(layerRef.current, renderClockState);
  }, [renderClockState]);

  useLayoutEffect(() => syncRenderClockSubtree(layerRef.current, renderClockStateRef), []);

  return (
    <div ref={layerRef} className="absolute inset-0 overflow-hidden" {...getRenderClockAttributes(renderClockState)} style={{ ...(part.frame.style as CSSProperties), ...renderClockStyle }}>
      {!part.background.hidden && <BackgroundLayerView animationsEnabled={animationsEnabled} background={part.background} duration={part.duration} previewTime={previewTime} />}
      {part.objects.filter(obj => !obj.hidden).map((object) => (
        <FrameObjectView key={object.id} animationsEnabled={animationsEnabled} object={object} canSelect={active && canSelect} duration={part.duration} editing={active && !isPlaying && editingTextObjectId === object.id} focusPicking={active && focusPicking} previewTime={previewTime} onDoubleClick={(event) => { if (active && !isPlaying) onTextObjectDoubleClick(event, object); }} onPointerDown={(event) => { if (active && !isPlaying) onObjectPointerDown(event, object); }} onTextEditCommit={(content, richText) => onTextEditCommit(object.id, content, richText)} />
      ))}
    </div>
  );
}

function TransitionCompositeView({ adjustmentLayers, animationsEnabled, isPlaying, renderMode, sequenceStyle, transitionPreviewParts }: { adjustmentLayers?: AdjustmentLayer[]; animationsEnabled: boolean; isPlaying: boolean; renderMode: "preview" | "export"; sequenceStyle: TransitionSequenceStyle | undefined; transitionPreviewParts: { from: Array<{ part: Part; start: number; previewTime: number }>; to: Array<{ part: Part; start: number; previewTime: number }>; fromSceneTime: number; toSceneTime: number } }) {
  const frameStyle = sequenceStyle?.frameStyle as CSSProperties | undefined;
  const aStyle = sequenceStyle?.aStyle as CSSProperties | undefined;
  const bStyle = sequenceStyle?.bStyle as CSSProperties | undefined;
  const fromAdjustment = useMemo(() => applyAdjustmentLayersToVisualStyle(transitionPreviewParts.fromSceneTime, adjustmentLayers), [adjustmentLayers, transitionPreviewParts.fromSceneTime]);
  const toAdjustment = useMemo(() => applyAdjustmentLayersToVisualStyle(transitionPreviewParts.toSceneTime, adjustmentLayers), [adjustmentLayers, transitionPreviewParts.toSceneTime]);

  return (
    <div className="absolute inset-0 overflow-hidden" style={frameStyle}>
      <div className="absolute inset-0 overflow-hidden" style={{ ...aStyle, willChange: "transform" }}>
          <TimelineSequenceView adjustment={fromAdjustment} animationsEnabled={animationsEnabled} isPlaying={isPlaying} parts={transitionPreviewParts.from} renderMode={renderMode} sequenceKey="from" />
      </div>
      <div className="absolute inset-0 overflow-hidden" style={{ ...bStyle, willChange: "transform" }}>
          <TimelineSequenceView adjustment={toAdjustment} animationsEnabled={animationsEnabled} isPlaying={isPlaying} parts={transitionPreviewParts.to} renderMode={renderMode} sequenceKey="to" />
      </div>
    </div>
  );
}

function TimelineSequenceView({ adjustment, animationsEnabled, isPlaying, parts, renderMode, sequenceKey }: { adjustment: ReturnType<typeof applyAdjustmentLayersToVisualStyle>; animationsEnabled: boolean; isPlaying: boolean; parts: Array<{ part: Part; start: number; previewTime: number }>; renderMode: "preview" | "export"; sequenceKey: string }) {
  const visualStyle = { filter: adjustment.filter } as CSSProperties;
  return (
    <div className="absolute inset-0" style={visualStyle}>
      {parts.map((item) => <CompositionLayerView key={`${sequenceKey}:${item.part.id}:${item.start}`} active={false} animationsEnabled={animationsEnabled} canSelect={false} editingTextObjectId={null} focusPicking={false} isPlaying={isPlaying} part={item.part} previewTime={item.previewTime} renderMode={renderMode} onObjectPointerDown={noopObjectPointerDown} onTextEditCommit={noopTextEditCommit} onTextObjectDoubleClick={noopTextDoubleClick} />)}
      {adjustment.overlays?.map((overlay) => <div key={overlay.id} className="pointer-events-none absolute inset-0" style={{ zIndex: 2147483647, ...overlay.style }} />)}
    </div>
  );
}

function getActiveTransitionLayer(sceneTime: number, layers: TransitionLayer[] | undefined) {
  return layers?.find((item) => sceneTime >= item.start && sceneTime < item.start + getTransitionFinishTime(item)) ?? null;
}

function noopObjectPointerDown() {}
function noopTextEditCommit() {}
function noopTextDoubleClick() {}

function syncRenderClockSubtree(root: HTMLDivElement | null, stateRef: { current: { playing: boolean; time: number; mode: "preview" | "export" } }) {
  syncDomAnimationsToRenderClock(root, stateRef.current);
  const frame = requestAnimationFrame(() => syncDomAnimationsToRenderClock(root, stateRef.current));
  const observer = typeof MutationObserver !== "undefined" && root ? new MutationObserver(() => syncDomAnimationsToRenderClock(root, stateRef.current)) : null;
  if (observer && root) observer.observe(root, { childList: true, subtree: true });
  return () => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
  };
}

export function FramePickPointOverlay({ point, frameScale }: { point: Point; frameScale: number }) {
  return (
    <div className="pointer-events-none absolute z-20" style={{ left: point.x * frameScale, top: point.y * frameScale }}>
      <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-[#159dff] shadow-[0_2px_8px_rgba(0,0,0,0.38)]" />
    </div>
  );
}

export const FrameObjectView = memo(function FrameObjectView({ animationsEnabled, object, canSelect, duration, editing, focusPicking, previewTime, onDoubleClick, onPointerDown, onTextEditCommit }: { animationsEnabled: boolean; object: FrameObject; canSelect: boolean; duration: number; editing: boolean; focusPicking: boolean; previewTime: number; onDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void; onPointerDown: (event: PointerEvent<HTMLDivElement>) => void; onTextEditCommit: (content: string, richText?: RichTextSegment[]) => void }) {
  const evaluatedObject = useMemo(() => evaluateObjectForPreview(object, previewTime, duration, animationsEnabled), [animationsEnabled, duration, object, previewTime]);
  const animation = { style: evaluatedObject.renderStyle, content: evaluatedObject.renderContent };
  const editableRef = useRef<HTMLDivElement | null>(null);
  const lastCommittedTextRef = useRef<string | null>(null);
  const objectTransform = typeof object.style.transform === "string" ? object.style.transform : undefined;
  const animationTransform = typeof animation.style.transform === "string" ? animation.style.transform : undefined;
  const style = {
    left: object.bounds.x,
    top: object.bounds.y,
    width: object.bounds.width,
    height: object.bounds.height,
    ...object.style,
    ...animation.style,
    transform: `translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px)) ${animationTransform ?? objectTransform ?? ""}`.trim(),
    willChange: "transform",
  } as CSSProperties;
  const content = animation.content ?? object.content;
  const richText = evaluatedObject.renderRichText;
  const textSegments = useMemo(() => getRenderableTextSegments(content ?? "", richText), [content, richText]);

  useEffect(() => {
    if (!editing || !editableRef.current) return;
    const currentCommittedText = JSON.stringify({ content: object.content ?? "", richText: object.richText });
    if (currentCommittedText === lastCommittedTextRef.current) return;

    const editable = editableRef.current;
    editable.replaceChildren(...textSegmentsToEditableNodes(getRenderableTextSegments(object.content ?? "", object.richText), Boolean(object.richText)));
    lastCommittedTextRef.current = currentCommittedText;
    editable.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editing, object.content, object.richText]);

  useEffect(() => {
    if (!editing) return;

    function commitBeforeAppPointerHandling(event: globalThis.PointerEvent) {
      const editable = editableRef.current;
      if (!editable || editable.contains(event.target as Node)) return;
      commitTextEdit();
    }

    window.addEventListener("pointerdown", commitBeforeAppPointerHandling, true);
    return () => window.removeEventListener("pointerdown", commitBeforeAppPointerHandling, true);
  }, [editing, object.style]);

  function commitTextEdit() {
    if (!editableRef.current) return;
    normalizeEditableFormatting(editableRef.current);
    const richText = richTextSegmentsFromElement(editableRef.current, object.style);
    const content = richText.map((segment) => segment.text).join("");
    const nextRichText = shouldPersistRichText(richText, object.style) ? richText : undefined;
    const nextCommittedText = JSON.stringify({ content, richText: nextRichText });
    if (nextCommittedText === lastCommittedTextRef.current) return;
    lastCommittedTextRef.current = nextCommittedText;
    onTextEditCommit(content, nextRichText);
  }

  function onTextEditKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey) {
      const key = event.key.toLowerCase();
      if (key === "b" || key === "i" || key === "u") {
        event.preventDefault();
        toggleEditableSelectionFormat(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
        return;
      }
      if (event.key === "Enter") editableRef.current?.blur();
    }
    if (event.key === "Escape") {
      const editable = editableRef.current;
      const selection = window.getSelection();
      if (editable && selection?.rangeCount && editable.contains(selection.getRangeAt(0).commonAncestorContainer)) selection.removeAllRanges();
      editable?.blur();
    }
  }

  function toggleEditableSelectionFormat(format: "bold" | "italic" | "underline") {
    if (!editableRef.current) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!editableRef.current.contains(range.commonAncestorContainer)) return;

    const current = getSelectionFormatState(selection, format);
    const span = document.createElement("span");
    if (format === "bold") span.style.fontWeight = current ? "400" : "700";
    if (format === "italic") span.style.fontStyle = current ? "normal" : "italic";
    if (format === "underline") span.style.textDecorationLine = current ? "none" : "underline";
    span.appendChild(range.extractContents());
    range.insertNode(span);

    selection.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    selection.addRange(nextRange);
  }

  const isLocked = Boolean(object.locked);

  return (
    <div className={`absolute flex touch-none select-none flex-col justify-center whitespace-pre-line ${object.type === "chart" ? "overflow-visible" : "overflow-hidden"} ${focusPicking ? "cursor-crosshair" : editing ? "cursor-text" : "cursor-default"} ${editing ? "select-text" : ""}`} data-object-id={canSelect && !isLocked ? object.id : undefined} style={{ ...style, ...(isLocked ? { opacity: 0.6 } : {}) }} onDoubleClick={(event) => { if (!isLocked) onDoubleClick(event); }} onPointerDown={(event) => { if (!isLocked) onPointerDown(event); }}>
      {object.type === "text" && editing ? <div ref={editableRef} className="min-h-0 w-full whitespace-pre-wrap outline-none" contentEditable suppressContentEditableWarning onBlur={commitTextEdit} onInput={commitTextEdit} onKeyDown={onTextEditKeyDown} onPointerDown={(event) => event.stopPropagation()} /> : null}
      {object.type === "text" && !editing ? <div className="min-h-0 w-full whitespace-pre-wrap">{renderRichTextSegments(textSegments, Boolean(richText))}</div> : null}
      {object.type === "chart" && object.chart ? <ChartObjectView animationsEnabled={animationsEnabled} object={object} duration={duration} previewTime={previewTime} /> : null}
      {object.type === "svg" && content ? <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: content }} /> : null}
      {(object.type === "html" || object.type === "template") && content ? <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: content }} /> : null}
      {object.type !== "text" && object.type !== "svg" && object.type !== "html" && object.type !== "template" && object.type !== "chart" && content ? content : null}
    </div>
  );
}, areFrameObjectPropsEqual);

function ChartObjectView({ animationsEnabled, object, duration, previewTime }: { animationsEnabled: boolean; object: FrameObject; duration: number; previewTime: number }) {
  const chartObjects = useMemo(() => object.chart ? generateChartObjects({ ...object.chart, bounds: object.bounds }) : [], [object.bounds, object.chart]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden="true">
      {chartObjects.map((chartObject) => <GeneratedChartObjectView key={chartObject.id} animationsEnabled={animationsEnabled} chartObject={chartObject} chartBounds={object.bounds} duration={duration} previewTime={previewTime} />)}
    </div>
  );
}

function GeneratedChartObjectView({ animationsEnabled, chartObject, chartBounds, duration, previewTime }: { animationsEnabled: boolean; chartObject: ChartGeneratedObject; chartBounds: Bounds; duration: number; previewTime: number }) {
  const object = useMemo<FrameObject>(() => chartGeneratedObjectToFrameObject(chartObject), [chartObject]);
  const evaluatedObject = useMemo(() => evaluateObjectForPreview(object, previewTime, duration, animationsEnabled), [animationsEnabled, duration, object, previewTime]);
  const animationTransform = typeof evaluatedObject.renderStyle.transform === "string" ? evaluatedObject.renderStyle.transform : undefined;
  const objectTransform = typeof object.style.transform === "string" ? object.style.transform : undefined;
  const style = {
    left: object.bounds.x - chartBounds.x,
    top: object.bounds.y - chartBounds.y,
    width: object.bounds.width,
    height: object.bounds.height,
    ...object.style,
    ...evaluatedObject.renderStyle,
    transform: `${animationTransform ?? objectTransform ?? ""}`.trim(),
    willChange: "transform",
  } as CSSProperties;
  const content = evaluatedObject.renderContent ?? object.content;

  return (
    <div className="absolute flex select-none flex-col justify-center overflow-visible whitespace-pre-line" style={style}>
      {object.type === "text" ? <div className="min-h-0 w-full whitespace-pre-wrap">{content}</div> : null}
      {object.type === "svg" && content ? <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: content }} /> : null}
      {(object.type === "html" || object.type === "template") && content ? <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: content }} /> : null}
      {object.type !== "text" && object.type !== "svg" && object.type !== "html" && object.type !== "template" && content ? content : null}
    </div>
  );
}

function chartGeneratedObjectToFrameObject(object: ChartGeneratedObject): FrameObject {
  return {
    id: object.id,
    name: object.name ?? object.id,
    type: object.kind,
    selector: "",
    bounds: object.bounds,
    content: object.content,
    template: object.template,
    style: object.style,
    motion: object.motion,
    layoutId: object.layoutId,
  };
}

function areFrameObjectPropsEqual(previous: { animationsEnabled: boolean; object: FrameObject; canSelect: boolean; duration: number; editing: boolean; focusPicking: boolean; previewTime: number }, next: { animationsEnabled: boolean; object: FrameObject; canSelect: boolean; duration: number; editing: boolean; focusPicking: boolean; previewTime: number }) {
  return previous.object === next.object
    && previous.animationsEnabled === next.animationsEnabled
    && previous.canSelect === next.canSelect
    && previous.duration === next.duration
    && previous.editing === next.editing
    && previous.focusPicking === next.focusPicking
    && (!next.animationsEnabled || !isPreviewTimeSensitiveObject(next.object) || previous.previewTime === next.previewTime);
}

function areBackgroundLayerPropsEqual(previous: { animationsEnabled: boolean; background: BackgroundLayer; duration: number; previewTime: number }, next: { animationsEnabled: boolean; background: BackgroundLayer; duration: number; previewTime: number }) {
  const timeSensitive = Boolean(next.background.motion) || next.background.elements.some(isPreviewTimeSensitiveObject);
  return previous.animationsEnabled === next.animationsEnabled && previous.background === next.background && previous.duration === next.duration && (!next.animationsEnabled || !timeSensitive || previous.previewTime === next.previewTime);
}

function areBackgroundElementPropsEqual(previous: { duration: number; element: EvaluatedFrameObject; previewTime: number }, next: { duration: number; element: EvaluatedFrameObject; previewTime: number }) {
  return previous.element === next.element && previous.duration === next.duration && (!next.element.timeSensitive || previous.previewTime === next.previewTime);
}

function isPreviewTimeSensitiveObject(object: FrameObject) {
  return isTimeSensitiveFrameObject(object) || object.type === "chart";
}

export function SelectionOverlayBox({ objectId, bounds, cameraTransform, frameScale, highlighted, interactive, overlayOffset = 0, onResizePointerDown }: { objectId: string; bounds: Bounds; cameraTransform: CameraPreviewTransform; frameScale: number; highlighted: boolean; interactive: boolean; overlayOffset?: number; onResizePointerDown: (event: PointerEvent<HTMLDivElement>, handle: ResizeHandle) => void }) {
  const viewportBounds = insetBounds(boundsToViewport(bounds, cameraTransform, frameScale), -selectorOffsetPx);
  const edgeHitClass = `${interactive ? "pointer-events-auto" : "pointer-events-none"} absolute grid place-items-center`;
  const horizontalEdgeHitClass = `${edgeHitClass} -left-1 -right-1 h-3 cursor-ns-resize`;
  const verticalEdgeHitClass = `${edgeHitClass} -top-1 -bottom-1 w-3 cursor-ew-resize`;
  const horizontalEdgeLineClass = `w-full opacity-95 ${highlighted ? "h-0.5" : "h-px"}`;
  const verticalEdgeLineClass = `h-full opacity-95 ${highlighted ? "w-0.5" : "w-px"}`;
  const edgeStyle = { backgroundColor: selectorBlue };
  const handleClass = `${interactive ? "pointer-events-auto" : "pointer-events-none"} absolute border-2 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.24)]`;
  const handleStyle = { width: selectorHandleSizePx, height: selectorHandleSizePx };
  const handleStyleWithColor = { ...handleStyle, borderColor: selectorBlue };
  const topLeftHandleClass = `${handleClass} left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize`;
  const topRightHandleClass = `${handleClass} right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize`;
  const bottomRightHandleClass = `${handleClass} bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize`;
  const bottomLeftHandleClass = `${handleClass} bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize`;
  return (
    <div data-frame-selection-box={objectId} className="pointer-events-none absolute bg-transparent" style={{ left: viewportBounds.x + overlayOffset, top: viewportBounds.y + overlayOffset, width: viewportBounds.width, height: viewportBounds.height, transform: "translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px))", zIndex: 70 }}>
      <div className={`${horizontalEdgeHitClass} top-0 -translate-y-1/2`} onPointerDown={(event) => onResizePointerDown(event, "top")}><span className={horizontalEdgeLineClass} style={edgeStyle} /></div>
      <div className={`${horizontalEdgeHitClass} bottom-0 translate-y-1/2`} onPointerDown={(event) => onResizePointerDown(event, "bottom")}><span className={horizontalEdgeLineClass} style={edgeStyle} /></div>
      <div className={`${verticalEdgeHitClass} left-0 -translate-x-1/2`} onPointerDown={(event) => onResizePointerDown(event, "left")}><span className={verticalEdgeLineClass} style={edgeStyle} /></div>
      <div className={`${verticalEdgeHitClass} right-0 translate-x-1/2`} onPointerDown={(event) => onResizePointerDown(event, "right")}><span className={verticalEdgeLineClass} style={edgeStyle} /></div>
      <div className={topLeftHandleClass} style={handleStyleWithColor} onPointerDown={(event) => onResizePointerDown(event, "top-left")} />
      <div className={topRightHandleClass} style={handleStyleWithColor} onPointerDown={(event) => onResizePointerDown(event, "top-right")} />
      <div className={bottomRightHandleClass} style={handleStyleWithColor} onPointerDown={(event) => onResizePointerDown(event, "bottom-right")} />
      <div className={bottomLeftHandleClass} style={handleStyleWithColor} onPointerDown={(event) => onResizePointerDown(event, "bottom-left")} />
    </div>
  );
}

export function DragSelectionBox({ ref, bounds, frameScale, visible }: { ref: RefObject<HTMLDivElement | null>; bounds: Bounds; frameScale: number; visible: boolean }) {
  useLayoutEffect(() => {
    if (ref.current) updateDragSelectionBoxElement(ref.current, bounds, frameScale, visible);
  }, [bounds, frameScale, ref, visible]);

  return <div ref={ref} className="pointer-events-none absolute left-0 top-0 border bg-[#159dff]/10 opacity-100 shadow-[0_0_0_1px_rgba(21,157,255,0.18)] will-change-transform" style={{ borderColor: selectorBlue, zIndex: 69 }} />;
}

export const BackgroundLayerView = memo(function BackgroundLayerView({ animationsEnabled, background, duration, previewTime }: { animationsEnabled: boolean; background: BackgroundLayer; duration: number; previewTime: number }) {
  const evaluatedBackground = useMemo(() => evaluateBackgroundLayer(background, previewTime, duration, { animations: animationsEnabled }), [animationsEnabled, background, duration, previewTime]);
  const layerStyle = evaluatedBackground.renderStyle as CSSProperties;
  const fillStyle = evaluatedBackground.fillStyle as CSSProperties;

  return (
    <div className={`pointer-events-none absolute inset-0 ${background.stretchToElements ? "overflow-visible" : "overflow-hidden"}`} data-layer-id={background.id} style={layerStyle}>
      <div className="absolute" style={fillStyle} />
      {evaluatedBackground.elements.filter((element) => !element.hidden).map((element) => <BackgroundElementView duration={duration} element={element} key={element.id} previewTime={previewTime} />)}
    </div>
  );
}, areBackgroundLayerPropsEqual);

export const BackgroundElementView = memo(function BackgroundElementView({ element }: { duration: number; element: EvaluatedFrameObject; previewTime: number }) {
  const animation = { style: element.renderStyle, content: element.renderContent };
  const style = {
    left: element.bounds.x,
    top: element.bounds.y,
    width: element.bounds.width,
    height: element.bounds.height,
    ...element.style,
    ...animation.style,
  } as CSSProperties;
  const content = animation.content ?? element.content;
  const textLines = useMemo(() => content?.split("\n") ?? [], [content]);

  return (
    <div className="absolute flex select-none flex-col justify-center overflow-hidden whitespace-pre-line" data-background-element-id={element.locked ? undefined : element.id} style={{ ...style, ...(element.locked ? { opacity: 0.6 } : {}) }}>
      {element.type === "text" ? textLines.map((line, index) => <span key={`${line}-${index}`}>{line}</span>) : null}
      {element.type === "svg" && content ? <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: content }} /> : null}
      {(element.type === "html" || element.type === "template") && content ? <div className="h-full w-full" dangerouslySetInnerHTML={{ __html: content }} /> : null}
      {element.type !== "text" && element.type !== "svg" && element.type !== "html" && element.type !== "template" && content ? content : null}
    </div>
  );
}, areBackgroundElementPropsEqual);

function evaluateObjectForPreview(object: FrameObject, time: number, duration: number, animationsEnabled: boolean): EvaluatedFrameObject {
  return evaluateFrameObject(object, time, duration, { animations: animationsEnabled });
}
