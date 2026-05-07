import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent, type RefObject, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { selectorBlue, selectorHandleSizePx, selectorOffsetPx } from "../../app/config";
import { getRenderableTextSegments, getSelectionFormatState, normalizeEditableFormatting, renderRichTextSegments, richTextSegmentsFromElement, shouldPersistRichText, textSegmentsToEditableNodes } from "../../app/richText";
import { applyAdjustmentLayersToVisualStyle } from "../../core/adjustments";
import { boundsToViewport, formatCameraPreviewFilter, formatCameraPreviewTransform, getLayeredCameraPreviewTransform, type CameraPreviewTransform } from "../../core/camera";
import { getBoundsUnion, getFrameObjectWithPreviewBounds, insetBounds, isVisibleMarqueeBounds, updateDragSelectionBoxElement, type ResizeHandle } from "../../core/frameInteraction";
import { clamp } from "../../core/math";
import { getRenderClockAttributes, getRenderClockStyle, syncDomAnimationsToRenderClock, waitForRenderClockAnimationsReady } from "../../render-engine/renderClock";
import { evaluateBackgroundLayer, evaluateFrameObject, isTimeSensitiveFrameObject, type EvaluatedFrameObject } from "../../render-engine/renderRuntime";
import { applyTransitionLayersToVisualStyle, getTransitionFinishTime, getTransitionProgress, renderTransitionSequence } from "../../core/transitions";
import { FRAME_HEIGHT, FRAME_WIDTH, type AdjustmentLayer, type BackgroundLayer, type Bounds, type FrameObject, type Part, type Point, type RichTextSegment, type SelectionPayload, type TimelineMode, type TimelineMotionLayerState, type TransitionLayer } from "../../core/types";
import type { AdjustmentVisualOverlay, TransitionSequenceStyle, TransitionVisualOverlay } from "../../core/effects/types";
import type { PlaybackClock } from "../../app/types";
import { rasterizeSvgForExport, shouldPreRasterizeSvgForExport, type SvgRasterResult } from "./exportSvgRasterCache";

const identityCameraTransform: CameraPreviewTransform = { x: 0, y: 0, z: 0, scale: 1, rotation: 0, rotateX: 0, rotateY: 0, perspective: 1800, motionBlur: 0 };

type ExportTileViewport = { x: number; y: number; width: number; height: number };
type ExportTileFrameBounds = { x: number; y: number; width: number; height: number };

export const FramePreview = memo(function FramePreview({ cameraRef, dragBox, dragSelectionBoxRef, framePickPoint, focusPicking, trackerPicking, canSelectObjects, cameraTransform, frameViewportRef, frameScale, isPlaying, part, partStart, adjustmentLayers, playbackClock, previewTime, sceneTime, timelineMode, motionLayers, hiddenMotionLayerIds, pickingTranslationPosition, pickingZoomFocus, compHidden, selectedObjects, marqueeDragging, editingTextObjectId, onFramePointerCancel, onFramePointerDown, onFramePointerDownCapture, onFramePointerMove, onFramePointerUp, onObjectPointerDown, onObjectResizePointerDown, onTextEditCommit, onTextObjectDoubleClick, onTrackerTargetPick }: { cameraRef: RefObject<HTMLDivElement | null>; dragBox: Bounds | null; dragSelectionBoxRef: RefObject<HTMLDivElement | null>; framePickPoint: Point | null; focusPicking: boolean; trackerPicking: boolean; canSelectObjects: boolean; cameraTransform: CameraPreviewTransform; frameViewportRef: RefObject<HTMLDivElement | null>; frameScale: number; isPlaying: boolean; part: Part; partStart: number; adjustmentLayers?: AdjustmentLayer[]; playbackClock: PlaybackClock; previewTime: number; sceneTime: number; timelineMode: TimelineMode; motionLayers: TimelineMotionLayerState[]; hiddenMotionLayerIds?: Set<string>; pickingTranslationPosition: boolean; pickingZoomFocus: boolean; compHidden?: boolean; selectedObjects: SelectionPayload["objects"]; marqueeDragging: boolean; editingTextObjectId: string | null; onFramePointerCancel: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerDown: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerDownCapture: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerMove: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerUp: (event: PointerEvent<HTMLDivElement>) => void; onObjectPointerDown: (event: PointerEvent<HTMLDivElement>, object: FrameObject) => void; onObjectResizePointerDown: (event: PointerEvent<HTMLDivElement>, handle: ResizeHandle, objectId?: string) => void; onTextEditCommit: (objectId: string, content: string, richText?: RichTextSegment[]) => void; onTextObjectDoubleClick: (event: ReactMouseEvent<HTMLDivElement>, object: FrameObject) => void; onTrackerTargetPick: (objectId: string) => void }) {
  const exportTileViewport = (arguments[0] as { exportTileViewport?: ExportTileViewport }).exportTileViewport;
  const exportTileFrameBounds = useMemo(() => exportTileViewport ? ({ x: exportTileViewport.x / frameScale, y: exportTileViewport.y / frameScale, width: exportTileViewport.width / frameScale, height: exportTileViewport.height / frameScale }) : undefined, [exportTileViewport, frameScale]);
  const viewportStyle = useMemo(() => ({ width: exportTileViewport?.width ?? FRAME_WIDTH * frameScale, height: exportTileViewport?.height ?? FRAME_HEIGHT * frameScale }) as CSSProperties, [exportTileViewport?.height, exportTileViewport?.width, frameScale]);
  const selectionOverlayScale = Math.max((arguments[0] as { selectionOverlayScale?: number }).selectionOverlayScale ?? 1, 0.001);
  const selectionOffsetPx = selectorOffsetPx / selectionOverlayScale;
  const selectionHandleSizePx = selectorHandleSizePx / selectionOverlayScale;
  const selectionBleedPx = selectionOffsetPx + selectionHandleSizePx;
  const animationsEnabled = true;
  const previewParts = (arguments[0] as { previewParts?: Array<{ part: Part; start: number; previewTime: number }> }).previewParts;
  const transitionPreviewParts = (arguments[0] as { transitionPreviewParts?: { from: Array<{ part: Part; start: number; previewTime: number }>; to: Array<{ part: Part; start: number; previewTime: number }>; fromSceneTime: number; toSceneTime: number } | null }).transitionPreviewParts;
  const transitionLayers = (arguments[0] as { transitionLayers?: TransitionLayer[] }).transitionLayers;
  const renderMode = (arguments[0] as { renderMode?: "preview" | "export" }).renderMode ?? "preview";
  const previewOverlayHost = (arguments[0] as { previewOverlayHost?: HTMLElement | null }).previewOverlayHost;
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
  const frameBackground = part.frame.style.background ?? "#000";
  const frameStyle = useMemo(() => ({ width: FRAME_WIDTH, height: FRAME_HEIGHT, background: frameBackground, left: exportTileViewport ? -exportTileViewport.x : 0, top: exportTileViewport ? -exportTileViewport.y : 0, transform: frameScale === 1 ? undefined : `scale(${frameScale})` }) as CSSProperties, [exportTileViewport, frameBackground, frameScale]);
  const perspectiveStageStyle = useMemo(() => ({ perspective: `${liveCameraTransform.perspective}px`, perspectiveOrigin: "center", transformStyle: "preserve-3d" }) as CSSProperties, [liveCameraTransform.perspective]);
  const selectableObjects = useMemo(() => [...part.background.elements, ...part.objects], [part.background.elements, part.objects]);
  const selectedPreviewObjects = useMemo(() => selectedObjects.map((selected) => {
    const object = selectableObjects.find((item) => item.id === selected.id);
    return object ? { ...selected, bounds: getFrameObjectWithPreviewBounds(object, displayPreviewTime, part.duration).bounds } : selected;
  }), [displayPreviewTime, part.duration, selectableObjects, selectedObjects]);
  const selectedBounds = useMemo(() => selectedPreviewObjects.length > 0 ? getBoundsUnion(selectedPreviewObjects.map((object) => object.bounds)) : null, [selectedPreviewObjects]);
  const selectedViewportBounds = useMemo(() => selectedBounds ? insetBounds(boundsToViewport(selectedBounds, liveCameraTransform, frameScale), -selectionOffsetPx) : null, [frameScale, liveCameraTransform, selectedBounds, selectionOffsetPx]);
  const selectionOverlayInsets = useMemo(() => {
    if (exportTileViewport || !selectedViewportBounds) return { left: 0, top: 0, right: 0, bottom: 0 };
    return {
      left: Math.max(selectionBleedPx, -selectedViewportBounds.x + selectionHandleSizePx),
      top: Math.max(selectionBleedPx, -selectedViewportBounds.y + selectionHandleSizePx),
      right: Math.max(selectionBleedPx, selectedViewportBounds.x + selectedViewportBounds.width - FRAME_WIDTH * frameScale + selectionHandleSizePx),
      bottom: Math.max(selectionBleedPx, selectedViewportBounds.y + selectedViewportBounds.height - FRAME_HEIGHT * frameScale + selectionHandleSizePx),
    };
  }, [exportTileViewport, frameScale, selectedViewportBounds, selectionBleedPx, selectionHandleSizePx]);
  const viewportOverlayStyle = useMemo(() => exportTileViewport ? ({ width: exportTileViewport.width, height: exportTileViewport.height }) as CSSProperties : ({ width: FRAME_WIDTH * frameScale + selectionOverlayInsets.left + selectionOverlayInsets.right, height: FRAME_HEIGHT * frameScale + selectionOverlayInsets.top + selectionOverlayInsets.bottom, marginLeft: -selectionOverlayInsets.left, marginTop: -selectionOverlayInsets.top, marginRight: -selectionOverlayInsets.right, marginBottom: -selectionOverlayInsets.bottom }) as CSSProperties, [exportTileViewport, frameScale, selectionOverlayInsets]);
  const clippedViewportStyle = useMemo(() => ({ ...viewportStyle, left: exportTileViewport ? 0 : selectionOverlayInsets.left, top: exportTileViewport ? 0 : selectionOverlayInsets.top }) as CSSProperties, [exportTileViewport, selectionOverlayInsets, viewportStyle]);
  const [trackerHoverTarget, setTrackerHoverTarget] = useState<{ id: string; viewportBounds: Bounds } | null>(null);
  const [selectorHover, setSelectorHover] = useState(false);
  const selectorHoverRef = useRef(false);
  const showDragBox = dragBox && isVisibleMarqueeBounds(dragBox, frameScale);
  const isUnlinkedPart = Boolean(part.sourceMissing);
  const compositionError = part.compositionError;
  const stackPreviewParts = previewParts?.length ? previewParts : [{ part, start: partStart, previewTime }];
  const livePlaybackPartRef = useRef(part);
  const livePlaybackClockRef = useRef(playbackClock);
  livePlaybackPartRef.current = part;
  livePlaybackClockRef.current = playbackClock;

  useEffect(() => {
    if (!cameraRef.current) return;
    const transitionTransform = typeof transitionCameraStyle?.transform === "string" ? transitionCameraStyle.transform : "";
    cameraRef.current.style.transform = `${transitionTransform} ${formatCameraPreviewTransform(liveCameraTransform)}`.trim();
    const transitionFilter = typeof transitionCameraStyle?.filter === "string" ? transitionCameraStyle.filter : "";
    const cameraFilter = formatCameraPreviewFilter(liveCameraTransform) ?? "";
    const combinedFilter = [transitionFilter, cameraFilter].filter(Boolean).join(" ");
    cameraRef.current.style.filter = combinedFilter;
  }, [cameraRef, liveCameraTransform, transitionCameraStyle]);

  useEffect(() => {
    if (!isPlaying || timelineMode !== "compose" || renderMode === "export") return;
    let frame = 0;

    function tick(now: number) {
      const clock = livePlaybackClockRef.current;
      const currentPart = livePlaybackPartRef.current;
      if (clock) {
        const liveSceneTime = clock.startedFrom + (now - clock.startedAt) / 1000;
        applyLiveComposePreviewTime(frameViewportRef.current, currentPart, liveSceneTime - partStart);
      }
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [frameViewportRef, isPlaying, partStart, renderMode, timelineMode]);

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
                    ? <TransitionCompositeView adjustmentLayers={adjustmentLayers} animationsEnabled={animationsEnabled} exportTileFrameBounds={exportTileFrameBounds} frameScale={frameScale} isPlaying={isPlaying} renderMode={renderMode} sequenceStyle={transitionSequenceStyle} transitionPreviewParts={transitionPreviewParts} />
                    : stackPreviewParts.map((item) => <CompositionLayerView key={`${item.part.id}:${item.start}`} active={item.part.id === part.id} animationsEnabled={animationsEnabled} canSelect={!isPlaying && (canSelectObjects || trackerPicking)} editingTextObjectId={editingTextObjectId} exportTileFrameBounds={exportTileFrameBounds} focusPicking={!isPlaying && (focusPicking || trackerPicking)} frameScale={frameScale} isPlaying={isPlaying} part={item.part} previewTime={item.previewTime} renderMode={renderMode} onObjectPointerDown={onObjectPointerDown} onTextEditCommit={onTextEditCommit} onTextObjectDoubleClick={onTextObjectDoubleClick} />)}
                  <div ref={frameVisualAdjustmentOverlaysRef} className="pointer-events-none absolute inset-0" data-clipper-visual-adjustment-overlays="frame" style={{ zIndex: 2147483647 }} />
                </div>
              </div>}
            </div>
            <div ref={cameraVisualAdjustmentOverlaysRef} className="pointer-events-none absolute inset-0" data-clipper-visual-adjustment-overlays="camera" style={{ zIndex: 2147483647 }} />
          </div>
          {trackerPicking && trackerHoverTarget ? <TrackerTargetOverlay target={trackerHoverTarget} /> : null}
          {dragBox ? <DragSelectionBox dragSelectionBoxRef={dragSelectionBoxRef} bounds={dragBox} frameScale={frameScale} visible={Boolean(showDragBox)} /> : null}
          {framePickPoint ? <FramePickPointOverlay point={framePickPoint} frameScale={frameScale} /> : null}
          <FramePickPointImperativeOverlay />
        </div>
      </div>
      {canSelectObjects && !isUnlinkedPart && previewOverlayHost ? createPortal(selectedPreviewObjects.map((object) => <SelectionOverlayBox key={object.id} objectId={object.id} bounds={object.bounds} cameraTransform={liveCameraTransform} frameScale={frameScale} frameViewportRef={frameViewportRef} handleSizePx={selectionHandleSizePx} highlighted={selectorHover} interactive={!marqueeDragging} offsetPx={selectionOffsetPx} portal portalHost={previewOverlayHost} uiScale={selectionOverlayScale} onResizePointerDown={(event, handle) => onObjectResizePointerDown(event, handle, object.id)} />), previewOverlayHost) : null}
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

function applyLiveComposePreviewTime(root: HTMLElement | null, part: Part, time: number) {
  if (!root) return;
  syncLiveComposeRenderClock(root, time);
  if (!part.background.hidden) {
    const evaluatedBackground = evaluateBackgroundLayer(part.background, time, part.duration, { animations: true });
    const backgroundElement = root.querySelector<HTMLElement>(`[data-layer-id="${cssEscape(part.background.id)}"]`);
    if (backgroundElement) applyLivePreviewLayerStyle(backgroundElement, evaluatedBackground.renderStyle);
    for (const element of evaluatedBackground.elements) {
      const target = root.querySelector<HTMLElement>(`[data-background-element-id="${cssEscape(element.id)}"]`);
      if (target) applyLivePreviewObject(target, element);
    }
  }
  for (const object of part.objects) {
    const target = root.querySelector<HTMLElement>(`[data-clipper-render-object-id="${cssEscape(object.id)}"]`);
    if (target) applyLivePreviewObject(target, evaluateFrameObject(object, time, part.duration, { animations: true }));
  }
}

function syncLiveComposeRenderClock(root: HTMLElement, time: number) {
  const state = { playing: true, time, mode: "preview" as const };
  const attrs = getRenderClockAttributes(state);
  const style = getRenderClockStyle(state);
  const layers = root.matches("[data-clipper-render-playing]") ? [root, ...root.querySelectorAll<HTMLElement>("[data-clipper-render-playing]")] : [...root.querySelectorAll<HTMLElement>("[data-clipper-render-playing]")];

  for (const layer of layers) {
    for (const [key, value] of Object.entries(attrs)) layer.setAttribute(key, value);
    for (const [key, value] of Object.entries(style)) layer.style.setProperty(key, String(value));
    syncDomAnimationsToRenderClock(layer, state);
  }
}

function applyLivePreviewObject(target: HTMLElement, object: EvaluatedFrameObject) {
  applyLivePreviewObjectStyle(target, object);
  if (object.renderContent !== undefined && object.renderContent !== object.content && target.textContent !== object.renderContent) target.textContent = object.renderContent;
}

function applyLivePreviewObjectStyle(target: HTMLElement, object: EvaluatedFrameObject) {
  const objectTransform = typeof object.style.transform === "string" ? object.style.transform : undefined;
  const animationTransform = typeof object.renderStyle.transform === "string" ? object.renderStyle.transform : undefined;
  applyLivePreviewStyle(target, object.renderStyle);
  target.style.transform = `translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px)) ${animationTransform ?? objectTransform ?? ""}`.trim();
  setLiveStyleValue(target, "opacity", object.renderStyle.opacity ?? object.style.opacity);
  setLiveStyleValue(target, "color", object.renderStyle.color ?? object.style.color);
  setLiveStyleValue(target, "backgroundColor", object.renderStyle.backgroundColor ?? object.style.backgroundColor);
}

function applyLivePreviewLayerStyle(target: HTMLElement, style: Record<string, string | number | undefined>) {
  applyLivePreviewStyle(target, style);
}

function setLiveStyleValue(target: HTMLElement, key: "transform" | "opacity" | "color" | "backgroundColor", value: string | number | undefined) {
  if (value === undefined) target.style[key] = "";
  else target.style[key] = String(value);
}

function applyLivePreviewStyle(target: HTMLElement, style: Record<string, string | number | undefined>) {
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
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/"/g, "\\\"");
}

function TrackerTargetOverlay({ target }: { target: { id: string; viewportBounds: Bounds } }) {
  const viewportBounds = insetBounds(target.viewportBounds, -selectorOffsetPx);

  return (
    <div className="pointer-events-none absolute border bg-[#159dff]/10 shadow-[0_0_0_1px_rgba(21,157,255,0.18)]" style={{ borderColor: selectorBlue, left: viewportBounds.x, top: viewportBounds.y, width: viewportBounds.width, height: viewportBounds.height, zIndex: 72 }}>
      <span className="absolute left-0 top-0 -translate-y-full whitespace-nowrap bg-[#159dff] px-1.5 py-0.5 text-[10px] font-normal leading-none text-white shadow-[0_2px_8px_rgba(0,0,0,0.35)]">{target.id}</span>
    </div>
  );
}

function CompositionLayerView({ active, animationsEnabled, canSelect, editingTextObjectId, exportTileFrameBounds, focusPicking, frameScale, isPlaying, part, previewTime, renderMode, onObjectPointerDown, onTextEditCommit, onTextObjectDoubleClick }: { active: boolean; animationsEnabled: boolean; canSelect: boolean; editingTextObjectId: string | null; exportTileFrameBounds?: ExportTileFrameBounds; focusPicking: boolean; frameScale: number; isPlaying: boolean; part: Part; previewTime: number; renderMode: "preview" | "export"; onObjectPointerDown: (event: PointerEvent<HTMLDivElement>, object: FrameObject) => void; onTextEditCommit: (objectId: string, content: string, richText?: RichTextSegment[]) => void; onTextObjectDoubleClick: (event: ReactMouseEvent<HTMLDivElement>, object: FrameObject) => void }) {
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
      {!part.background.hidden && <BackgroundLayerView animationsEnabled={animationsEnabled} background={part.background} duration={part.duration} exportTileFrameBounds={exportTileFrameBounds} frameScale={frameScale} previewTime={previewTime} renderMode={renderMode} />}
      {part.objects.filter(obj => !obj.hidden && isObjectInExportTile(obj, exportTileFrameBounds)).map((object) => (
        <FrameObjectView key={object.id} animationsEnabled={animationsEnabled} exportTileFrameBounds={exportTileFrameBounds} object={object} canSelect={active && canSelect} duration={part.duration} editing={active && !isPlaying && editingTextObjectId === object.id} focusPicking={active && focusPicking} frameScale={frameScale} previewTime={previewTime} renderMode={renderMode} onDoubleClick={(event) => { if (active && !isPlaying) onTextObjectDoubleClick(event, object); }} onPointerDown={(event) => { if (active && !isPlaying) onObjectPointerDown(event, object); }} onTextEditCommit={(content, richText) => onTextEditCommit(object.id, content, richText)} />
      ))}
    </div>
  );
}

function TransitionCompositeView({ adjustmentLayers, animationsEnabled, exportTileFrameBounds, frameScale, isPlaying, renderMode, sequenceStyle, transitionPreviewParts }: { adjustmentLayers?: AdjustmentLayer[]; animationsEnabled: boolean; exportTileFrameBounds?: ExportTileFrameBounds; frameScale: number; isPlaying: boolean; renderMode: "preview" | "export"; sequenceStyle: TransitionSequenceStyle | undefined; transitionPreviewParts: { from: Array<{ part: Part; start: number; previewTime: number }>; to: Array<{ part: Part; start: number; previewTime: number }>; fromSceneTime: number; toSceneTime: number } }) {
  const frameStyle = sequenceStyle?.frameStyle as CSSProperties | undefined;
  const aStyle = sequenceStyle?.aStyle as CSSProperties | undefined;
  const bStyle = sequenceStyle?.bStyle as CSSProperties | undefined;
  const fromAdjustment = useMemo(() => applyAdjustmentLayersToVisualStyle(transitionPreviewParts.fromSceneTime, adjustmentLayers), [adjustmentLayers, transitionPreviewParts.fromSceneTime]);
  const toAdjustment = useMemo(() => applyAdjustmentLayersToVisualStyle(transitionPreviewParts.toSceneTime, adjustmentLayers), [adjustmentLayers, transitionPreviewParts.toSceneTime]);

  return (
    <div className="absolute inset-0 overflow-hidden" style={frameStyle}>
      <div className="absolute inset-0 overflow-hidden" style={{ ...aStyle, willChange: renderMode === "export" ? undefined : "transform" }}>
          <TimelineSequenceView adjustment={fromAdjustment} animationsEnabled={animationsEnabled} exportTileFrameBounds={exportTileFrameBounds} frameScale={frameScale} isPlaying={isPlaying} parts={transitionPreviewParts.from} renderMode={renderMode} sequenceKey="from" />
      </div>
      <div className="absolute inset-0 overflow-hidden" style={{ ...bStyle, willChange: renderMode === "export" ? undefined : "transform" }}>
          <TimelineSequenceView adjustment={toAdjustment} animationsEnabled={animationsEnabled} exportTileFrameBounds={exportTileFrameBounds} frameScale={frameScale} isPlaying={isPlaying} parts={transitionPreviewParts.to} renderMode={renderMode} sequenceKey="to" />
      </div>
    </div>
  );
}

function TimelineSequenceView({ adjustment, animationsEnabled, exportTileFrameBounds, frameScale, isPlaying, parts, renderMode, sequenceKey }: { adjustment: ReturnType<typeof applyAdjustmentLayersToVisualStyle>; animationsEnabled: boolean; exportTileFrameBounds?: ExportTileFrameBounds; frameScale: number; isPlaying: boolean; parts: Array<{ part: Part; start: number; previewTime: number }>; renderMode: "preview" | "export"; sequenceKey: string }) {
  const visualStyle = { filter: adjustment.filter } as CSSProperties;
  return (
    <div className="absolute inset-0" style={visualStyle}>
      {parts.map((item) => <CompositionLayerView key={`${sequenceKey}:${item.part.id}:${item.start}`} active={false} animationsEnabled={animationsEnabled} canSelect={false} editingTextObjectId={null} exportTileFrameBounds={exportTileFrameBounds} focusPicking={false} frameScale={frameScale} isPlaying={isPlaying} part={item.part} previewTime={item.previewTime} renderMode={renderMode} onObjectPointerDown={noopObjectPointerDown} onTextEditCommit={noopTextEditCommit} onTextObjectDoubleClick={noopTextDoubleClick} />)}
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
    <div className="pointer-events-none absolute z-20" data-clipper-frame-pick-point style={{ transform: `translate3d(${point.x * frameScale}px, ${point.y * frameScale}px, 0)` }}>
      <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-[#159dff] shadow-[0_2px_8px_rgba(0,0,0,0.38)]" />
    </div>
  );
}

function FramePickPointImperativeOverlay() {
  return (
    <div className="pointer-events-none absolute z-20 opacity-0" data-clipper-motion-pick-preview style={{ transform: "translate3d(0px, 0px, 0)" }}>
      <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-[#159dff] shadow-[0_2px_8px_rgba(0,0,0,0.38)]" />
    </div>
  );
}

export const FrameObjectView = memo(function FrameObjectView({ animationsEnabled, exportTileFrameBounds, object, canSelect, duration, editing, focusPicking, frameScale, previewTime, renderMode, onDoubleClick, onPointerDown, onTextEditCommit }: { animationsEnabled: boolean; exportTileFrameBounds?: ExportTileFrameBounds; object: FrameObject; canSelect: boolean; duration: number; editing: boolean; focusPicking: boolean; frameScale: number; previewTime: number; renderMode: "preview" | "export"; onDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void; onPointerDown: (event: PointerEvent<HTMLDivElement>) => void; onTextEditCommit: (content: string, richText?: RichTextSegment[]) => void }) {
  const evaluatedObject = useMemo(() => evaluateObjectForPreview(object, previewTime, duration, animationsEnabled), [animationsEnabled, duration, object, previewTime]);
  const animation = { style: evaluatedObject.renderStyle, content: evaluatedObject.renderContent };
  const editableRef = useRef<HTMLDivElement | null>(null);
  const lastCommittedTextRef = useRef<string | null>(null);
  const wasEditingRef = useRef(false);
  const objectTransform = typeof object.style.transform === "string" ? object.style.transform : undefined;
  const animationTransform = typeof animation.style.transform === "string" ? animation.style.transform : undefined;
  const style = {
    ...object.style,
    ...animation.style,
    left: object.bounds.x,
    top: object.bounds.y,
    width: object.bounds.width,
    height: object.bounds.height,
    transform: renderMode === "export" ? (animationTransform ?? objectTransform) : `translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px)) ${animationTransform ?? objectTransform ?? ""}`.trim(),
    willChange: renderMode === "export" ? undefined : "transform",
  } as CSSProperties;
  const content = animation.content ?? object.content;
  const richText = evaluatedObject.renderRichText;
  const textSegments = useMemo(() => getRenderableTextSegments(content ?? "", richText), [content, richText]);

  useEffect(() => {
    if (!editing || !editableRef.current) {
      wasEditingRef.current = false;
      return;
    }
    const currentCommittedText = JSON.stringify({ content: object.content ?? "", richText: object.richText });
    if (wasEditingRef.current && currentCommittedText === lastCommittedTextRef.current) return;

    const editable = editableRef.current;
    editable.replaceChildren(...textSegmentsToEditableNodes(getRenderableTextSegments(object.content ?? "", object.richText), Boolean(object.richText)));
    lastCommittedTextRef.current = currentCommittedText;
    wasEditingRef.current = true;
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
    <div className={`absolute flex touch-none select-none flex-col justify-center whitespace-pre-line overflow-hidden ${focusPicking ? "cursor-crosshair" : editing ? "cursor-text" : "cursor-default"} ${editing ? "select-text" : ""}`} data-clipper-render-object-id={object.id} data-object-id={canSelect && !isLocked ? object.id : undefined} style={{ ...style, ...(isLocked ? { opacity: 0.6 } : {}) }} onDoubleClick={(event) => { if (!isLocked) onDoubleClick(event); }} onPointerDown={(event) => { if (!isLocked) onPointerDown(event); }}>
      {object.type === "text" && editing ? <div ref={editableRef} className="min-h-0 w-full whitespace-pre-wrap outline-none" contentEditable suppressContentEditableWarning onBlur={commitTextEdit} onInput={commitTextEdit} onKeyDown={onTextEditKeyDown} onPointerDown={(event) => event.stopPropagation()} /> : null}
      {object.type === "text" && !editing ? <div className="min-h-0 w-full whitespace-pre-wrap">{renderRichTextSegments(textSegments, Boolean(richText))}</div> : null}
      {object.type === "svg" && content ? <ExportSvgContent bounds={object.bounds} content={content} exportTileFrameBounds={exportTileFrameBounds} frameScale={frameScale} markupKind="svg" owner={{ id: object.id, name: object.name, type: object.type, layer: "object" }} renderMode={renderMode} style={style} /> : null}
      {(object.type === "html" || object.type === "template") && content ? <HtmlContent content={content} /> : null}
      {object.type !== "text" && object.type !== "svg" && object.type !== "html" && object.type !== "template" && content ? content : null}
    </div>
  );
}, areFrameObjectPropsEqual);

function isObjectInExportTile(object: FrameObject, tile: ExportTileFrameBounds | undefined): boolean {
  if (!tile) return true;
  const bleed = getExportTileBleed(object);
  return rectsIntersect(
    { x: object.bounds.x, y: object.bounds.y, width: object.bounds.width, height: object.bounds.height },
    { x: tile.x - bleed, y: tile.y - bleed, width: tile.width + bleed * 2, height: tile.height + bleed * 2 },
  );
}

function isEvaluatedObjectInExportTile(object: EvaluatedFrameObject, tile: ExportTileFrameBounds | undefined): boolean {
  if (!tile) return true;
  const bleed = getExportTileBleed(object);
  return rectsIntersect(
    { x: object.bounds.x, y: object.bounds.y, width: object.bounds.width, height: object.bounds.height },
    { x: tile.x - bleed, y: tile.y - bleed, width: tile.width + bleed * 2, height: tile.height + bleed * 2 },
  );
}

function getExportTileBleed(object: Pick<FrameObject, "style" | "type">): number {
  const style = object.style as Record<string, unknown>;
  const maybeFilter = [style.filter, style.boxShadow, style.textShadow].filter((value) => typeof value === "string").join(" ");
  if (/blur|drop-shadow|shadow|filter/i.test(maybeFilter)) return 256;
  return object.type === "svg" || object.type === "html" || object.type === "template" ? 64 : 16;
}

function rectsIntersect(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

type ExportRasterOwner = { id: string; name?: string; type: string; layer: "object" | "background" };

function ExportSvgContent({ bounds, content, exportTileFrameBounds, frameScale, markupKind, owner, renderMode, style }: { bounds: Bounds; content: string; exportTileFrameBounds?: ExportTileFrameBounds; frameScale: number; markupKind: "svg"; owner: ExportRasterOwner; renderMode: "preview" | "export"; style?: CSSProperties }) {
  const [raster, setRaster] = useState<SvgRasterResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const styleKey = useMemo(() => JSON.stringify(style ?? {}), [style]);
  const rasterCrop = useMemo(() => getObjectRasterCrop(bounds, exportTileFrameBounds), [bounds, exportTileFrameBounds]);
  const rasterBounds = rasterCrop?.bounds ?? bounds;
  const sourceOffset = rasterCrop?.sourceOffset;
  const shouldRasterize = renderMode === "export" && shouldPreRasterizeSvgForExport({ svg: content, bounds: rasterBounds, frameScale, style, markupKind });

  useEffect(() => {
    if (!shouldRasterize) {
      setRaster(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setRaster(null);
    setError(null);
    rasterizeSvgForExport({ svg: content, bounds: rasterBounds, frameScale, style, markupKind, sourceBounds: bounds, sourceOffset })
      .then((result) => {
        if (!cancelled) setRaster(result);
      })
      .catch((rasterError) => {
        if (!cancelled) setError(toExportRasterErrorMessage(rasterError, { bounds, exportTileFrameBounds, frameScale, markupKind, owner, rasterBounds, sourceOffset }));
      });

    return () => {
      cancelled = true;
    };
  }, [bounds, content, frameScale, markupKind, rasterBounds, renderMode, shouldRasterize, sourceOffset, styleKey]);

  if (!shouldRasterize) return <HtmlContent content={content} />;
  const diagnostic = getExportRasterDiagnostic({ bounds, exportTileFrameBounds, frameScale, markupKind, owner, rasterBounds, sourceOffset, source: raster?.source ?? "canvas-png" });
  if (error) return <div className="h-full w-full" data-clipper-export-svg-raster="failed" data-clipper-export-svg-raster-diagnostic={diagnostic} data-clipper-export-svg-raster-error={error} />;
  if (!raster) return <div className="h-full w-full" data-clipper-export-svg-raster="pending" data-clipper-export-svg-raster-diagnostic={diagnostic} />;
  return <img alt="" className="block" data-clipper-export-svg-raster="ready" data-clipper-export-svg-raster-diagnostic={diagnostic} draggable={false} src={raster.url} style={rasterCrop ? { left: rasterCrop.sourceOffset.x, position: "absolute", top: rasterCrop.sourceOffset.y, width: rasterCrop.bounds.width, height: rasterCrop.bounds.height } : { width: "100%", height: "100%" }} />;
}

function toExportRasterErrorMessage(error: unknown, diagnostic: ExportRasterDiagnosticInput) {
  const message = error instanceof Error ? error.message : String(error);
  return `Export SVG rasterization failed: ${message}. ${getExportRasterDiagnostic(diagnostic)}`;
}

type ExportRasterDiagnosticInput = { bounds: Bounds; exportTileFrameBounds?: ExportTileFrameBounds; frameScale: number; markupKind: "svg" | "html"; owner: ExportRasterOwner; rasterBounds: Bounds; source?: SvgRasterResult["source"]; sourceOffset?: { x: number; y: number } };

function getExportRasterDiagnostic({ bounds, exportTileFrameBounds, frameScale, markupKind, owner, rasterBounds, source, sourceOffset }: ExportRasterDiagnosticInput) {
  const rasterWidth = Math.max(1, Math.ceil(rasterBounds.width * frameScale));
  const rasterHeight = Math.max(1, Math.ceil(rasterBounds.height * frameScale));
  return [
    `owner=${owner.layer}:${owner.type}:${owner.id}`,
    owner.name ? `name=${JSON.stringify(owner.name)}` : undefined,
    `markup=${markupKind}`,
    source ? `source=${source}` : undefined,
    `raster=${rasterWidth}x${rasterHeight}`,
    `bounds=${formatBounds(bounds)}`,
    exportTileFrameBounds ? `tile=${formatBounds(exportTileFrameBounds)}` : undefined,
    sourceOffset ? `sourceOffset=${formatPoint(sourceOffset)}` : undefined,
  ].filter(Boolean).join(" ");
}

function getObjectRasterCrop(bounds: Bounds, tile: ExportTileFrameBounds | undefined) {
  if (!tile) return null;
  const crop = intersectBounds(bounds, tile);
  if (!crop) return null;
  if (crop.x === bounds.x && crop.y === bounds.y && crop.width === bounds.width && crop.height === bounds.height) return null;
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

function areFrameObjectPropsEqual(previous: { animationsEnabled: boolean; exportTileFrameBounds?: ExportTileFrameBounds; object: FrameObject; canSelect: boolean; duration: number; editing: boolean; focusPicking: boolean; frameScale: number; previewTime: number; renderMode: "preview" | "export" }, next: { animationsEnabled: boolean; exportTileFrameBounds?: ExportTileFrameBounds; object: FrameObject; canSelect: boolean; duration: number; editing: boolean; focusPicking: boolean; frameScale: number; previewTime: number; renderMode: "preview" | "export" }) {
  return previous.object === next.object
    && previous.animationsEnabled === next.animationsEnabled
    && previous.canSelect === next.canSelect
    && previous.duration === next.duration
    && previous.editing === next.editing
    && previous.exportTileFrameBounds === next.exportTileFrameBounds
    && previous.focusPicking === next.focusPicking
    && previous.frameScale === next.frameScale
    && previous.renderMode === next.renderMode
    && (!next.animationsEnabled || !isPreviewTimeSensitiveObject(next.object) || previous.previewTime === next.previewTime);
}

function areBackgroundLayerPropsEqual(previous: { animationsEnabled: boolean; background: BackgroundLayer; duration: number; exportTileFrameBounds?: ExportTileFrameBounds; frameScale: number; previewTime: number; renderMode: "preview" | "export" }, next: { animationsEnabled: boolean; background: BackgroundLayer; duration: number; exportTileFrameBounds?: ExportTileFrameBounds; frameScale: number; previewTime: number; renderMode: "preview" | "export" }) {
  const timeSensitive = Boolean(next.background.animations?.length) || next.background.elements.some(isPreviewTimeSensitiveObject);
  return previous.animationsEnabled === next.animationsEnabled && previous.background === next.background && previous.duration === next.duration && previous.exportTileFrameBounds === next.exportTileFrameBounds && previous.frameScale === next.frameScale && previous.renderMode === next.renderMode && (!next.animationsEnabled || !timeSensitive || previous.previewTime === next.previewTime);
}

function areBackgroundElementPropsEqual(previous: { duration: number; element: EvaluatedFrameObject; frameScale: number; previewTime: number; renderMode: "preview" | "export" }, next: { duration: number; element: EvaluatedFrameObject; frameScale: number; previewTime: number; renderMode: "preview" | "export" }) {
  return previous.element === next.element && previous.duration === next.duration && previous.frameScale === next.frameScale && previous.renderMode === next.renderMode && (!next.element.timeSensitive || previous.previewTime === next.previewTime);
}

function isPreviewTimeSensitiveObject(object: FrameObject) {
  return isTimeSensitiveFrameObject(object);
}

export function SelectionOverlayBox({ objectId, bounds, cameraTransform, frameScale, frameViewportRef, handleSizePx = selectorHandleSizePx, highlighted, interactive, offsetPx = selectorOffsetPx, overlayOffset = { left: 0, top: 0 }, portal = false, portalHost, uiScale = 1, onResizePointerDown }: { objectId: string; bounds: Bounds; cameraTransform: CameraPreviewTransform; frameScale: number; frameViewportRef?: RefObject<HTMLDivElement | null>; handleSizePx?: number; highlighted: boolean; interactive: boolean; offsetPx?: number; overlayOffset?: { left: number; top: number }; portal?: boolean; portalHost?: HTMLElement | null; uiScale?: number; onResizePointerDown: (event: PointerEvent<HTMLDivElement>, handle: ResizeHandle) => void }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const viewportBounds = insetBounds(boundsToViewport(bounds, cameraTransform, frameScale), -offsetPx);
  const edgeHitThicknessPx = portal ? 12 : 12 / uiScale;
  const edgeHitInsetPx = portal ? -4 : -4 / uiScale;
  const edgeLineThicknessPx = portal ? (highlighted ? 2 : 1) : (highlighted ? 2 : 1) / uiScale;
  const edgeHitClass = `${interactive ? "pointer-events-auto" : "pointer-events-none"} absolute grid place-items-center`;
  const horizontalEdgeHitClass = `${edgeHitClass} cursor-ns-resize`;
  const verticalEdgeHitClass = `${edgeHitClass} cursor-ew-resize`;
  const horizontalEdgeLineClass = "w-full opacity-95";
  const verticalEdgeLineClass = "h-full opacity-95";
  const edgeStyle = { backgroundColor: selectorBlue };
  const horizontalEdgeHitStyle = { left: edgeHitInsetPx, right: edgeHitInsetPx, height: edgeHitThicknessPx };
  const verticalEdgeHitStyle = { top: edgeHitInsetPx, bottom: edgeHitInsetPx, width: edgeHitThicknessPx };
  const horizontalEdgeLineStyle = { ...edgeStyle, height: edgeLineThicknessPx };
  const verticalEdgeLineStyle = { ...edgeStyle, width: edgeLineThicknessPx };
  const handleClass = `${interactive ? "pointer-events-auto" : "pointer-events-none"} absolute bg-white shadow-[0_1px_4px_rgba(0,0,0,0.24)]`;
  const handleStyle = { width: portal ? selectorHandleSizePx : handleSizePx, height: portal ? selectorHandleSizePx : handleSizePx, border: `${portal ? 2 : 2 / uiScale}px solid ${selectorBlue}` };
  const handleStyleWithColor = { ...handleStyle, borderColor: selectorBlue };
  const topLeftHandleClass = `${handleClass} left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize`;
  const topRightHandleClass = `${handleClass} right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize`;
  const bottomRightHandleClass = `${handleClass} bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize`;
  const bottomLeftHandleClass = `${handleClass} bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize`;
  const boxStyle = portal
    ? { left: 0, top: 0, width: 0, height: 0, position: "absolute", transform: "translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px))", willChange: "left, top, width, height, transform", zIndex: 70 } as CSSProperties
    : { left: viewportBounds.x + overlayOffset.left, top: viewportBounds.y + overlayOffset.top, width: viewportBounds.width, height: viewportBounds.height, transform: "translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px))", zIndex: 70 } as CSSProperties;

  useLayoutEffect(() => {
    if (!portal || !portalHost || !frameViewportRef) return;
    const host = portalHost;
    const viewportRef = frameViewportRef;
    let frameId = 0;

    function syncPortalBox() {
      const element = boxRef.current;
      const frameViewport = viewportRef.current;
      if (element && frameViewport) {
        const frameRect = frameViewport.getBoundingClientRect();
        const hostRect = host.getBoundingClientRect();
        const scale = frameRect.width / (FRAME_WIDTH * frameScale);
        element.style.left = `${frameRect.left - hostRect.left + viewportBounds.x * scale}px`;
        element.style.top = `${frameRect.top - hostRect.top + viewportBounds.y * scale}px`;
        element.style.width = `${viewportBounds.width * scale}px`;
        element.style.height = `${viewportBounds.height * scale}px`;
      }
      frameId = requestAnimationFrame(syncPortalBox);
    }

    syncPortalBox();
    return () => cancelAnimationFrame(frameId);
  }, [frameScale, frameViewportRef, portal, portalHost, viewportBounds.height, viewportBounds.width, viewportBounds.x, viewportBounds.y]);

  return (
    <div ref={boxRef} data-frame-selection-box={objectId} data-frame-selection-box-portal={portal ? "true" : undefined} className={`${portal ? "absolute" : "absolute"} pointer-events-none bg-transparent`} style={boxStyle}>
      <div className={`${horizontalEdgeHitClass} top-0 -translate-y-1/2`} style={horizontalEdgeHitStyle} onPointerDown={(event) => onResizePointerDown(event, "top")}><span className={horizontalEdgeLineClass} style={horizontalEdgeLineStyle} /></div>
      <div className={`${horizontalEdgeHitClass} bottom-0 translate-y-1/2`} style={horizontalEdgeHitStyle} onPointerDown={(event) => onResizePointerDown(event, "bottom")}><span className={horizontalEdgeLineClass} style={horizontalEdgeLineStyle} /></div>
      <div className={`${verticalEdgeHitClass} left-0 -translate-x-1/2`} style={verticalEdgeHitStyle} onPointerDown={(event) => onResizePointerDown(event, "left")}><span className={verticalEdgeLineClass} style={verticalEdgeLineStyle} /></div>
      <div className={`${verticalEdgeHitClass} right-0 translate-x-1/2`} style={verticalEdgeHitStyle} onPointerDown={(event) => onResizePointerDown(event, "right")}><span className={verticalEdgeLineClass} style={verticalEdgeLineStyle} /></div>
      <div className={topLeftHandleClass} style={handleStyleWithColor} onPointerDown={(event) => onResizePointerDown(event, "top-left")} />
      <div className={topRightHandleClass} style={handleStyleWithColor} onPointerDown={(event) => onResizePointerDown(event, "top-right")} />
      <div className={bottomRightHandleClass} style={handleStyleWithColor} onPointerDown={(event) => onResizePointerDown(event, "bottom-right")} />
      <div className={bottomLeftHandleClass} style={handleStyleWithColor} onPointerDown={(event) => onResizePointerDown(event, "bottom-left")} />
    </div>
  );
}

export function DragSelectionBox({ dragSelectionBoxRef, bounds, frameScale, visible }: { dragSelectionBoxRef: RefObject<HTMLDivElement | null>; bounds: Bounds; frameScale: number; visible: boolean }) {
  useLayoutEffect(() => {
    if (dragSelectionBoxRef.current) updateDragSelectionBoxElement(dragSelectionBoxRef.current, bounds, frameScale, visible);
  }, [bounds, dragSelectionBoxRef, frameScale, visible]);

  return <div ref={dragSelectionBoxRef} className="pointer-events-none absolute left-0 top-0 border bg-[#159dff]/10 opacity-100 shadow-[0_0_0_1px_rgba(21,157,255,0.18)] will-change-transform" style={{ borderColor: selectorBlue, zIndex: 69 }} />;
}

export const BackgroundLayerView = memo(function BackgroundLayerView({ animationsEnabled, background, duration, exportTileFrameBounds, frameScale, previewTime, renderMode }: { animationsEnabled: boolean; background: BackgroundLayer; duration: number; exportTileFrameBounds?: ExportTileFrameBounds; frameScale: number; previewTime: number; renderMode: "preview" | "export" }) {
  const evaluatedBackground = useMemo(() => evaluateBackgroundLayer(background, previewTime, duration, { animations: animationsEnabled }), [animationsEnabled, background, duration, previewTime]);
  const layerStyle = evaluatedBackground.renderStyle as CSSProperties;
  const fillStyle = evaluatedBackground.fillStyle as CSSProperties;

  return (
    <div className={`pointer-events-none absolute inset-0 ${background.stretchToElements ? "overflow-visible" : "overflow-hidden"}`} data-layer-id={background.id} style={layerStyle}>
      <div className="absolute" style={fillStyle} />
      {evaluatedBackground.elements.filter((element) => !element.hidden && isEvaluatedObjectInExportTile(element, exportTileFrameBounds)).map((element) => <BackgroundElementView duration={duration} element={element} exportTileFrameBounds={exportTileFrameBounds} frameScale={frameScale} key={element.id} previewTime={previewTime} renderMode={renderMode} />)}
    </div>
  );
}, areBackgroundLayerPropsEqual);

export const BackgroundElementView = memo(function BackgroundElementView({ element, exportTileFrameBounds, frameScale, previewTime, renderMode }: { duration: number; element: EvaluatedFrameObject; exportTileFrameBounds?: ExportTileFrameBounds; frameScale: number; previewTime: number; renderMode: "preview" | "export" }) {
  const animation = { style: element.renderStyle, content: element.renderContent };
  const objectTransform = typeof element.style.transform === "string" ? element.style.transform : undefined;
  const animationTransform = typeof animation.style.transform === "string" ? animation.style.transform : undefined;
  const style = {
    ...element.style,
    ...animation.style,
    left: element.bounds.x,
    top: element.bounds.y,
    width: element.bounds.width,
    height: element.bounds.height,
    transform: renderMode === "export" ? (animationTransform ?? objectTransform) : `translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px)) ${animationTransform ?? objectTransform ?? ""}`.trim(),
    willChange: renderMode === "export" ? undefined : "transform",
  } as CSSProperties;
  const content = animation.content ?? element.content;
  const textLines = useMemo(() => content?.split("\n") ?? [], [content]);

  return (
    <div className="absolute flex select-none flex-col justify-center overflow-hidden whitespace-pre-line" data-background-element-id={element.locked ? undefined : element.id} style={{ ...style, ...(element.locked ? { opacity: 0.6 } : {}) }}>
      {element.type === "text" ? textLines.map((line, index) => <span key={`${line}-${index}`}>{line}</span>) : null}
      {element.type === "svg" && content ? <ExportSvgContent bounds={element.bounds} content={content} exportTileFrameBounds={exportTileFrameBounds} frameScale={frameScale} markupKind="svg" owner={{ id: element.id, name: element.name, type: element.type, layer: "background" }} renderMode={renderMode} style={style} /> : null}
      {(element.type === "html" || element.type === "template") && content ? <HtmlContent content={content} /> : null}
      {element.type !== "text" && element.type !== "svg" && element.type !== "html" && element.type !== "template" && content ? content : null}
    </div>
  );
}, areBackgroundElementPropsEqual);

function evaluateObjectForPreview(object: FrameObject, time: number, duration: number, animationsEnabled: boolean): EvaluatedFrameObject {
  return evaluateFrameObject(object, time, duration, { animations: animationsEnabled });
}

function HtmlContent({ content }: { content: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    root.innerHTML = content;
    const scripts = Array.from(root.querySelectorAll("script"));
    for (const script of scripts) {
      const executable = document.createElement("script");
      for (const attribute of script.attributes) executable.setAttribute(attribute.name, attribute.value);
      executable.text = script.text;
      script.replaceWith(executable);
    }

    return () => {
      for (const node of Array.from(root.querySelectorAll<HTMLElement>("[data-clipper-three-root]"))) {
        const cleanup = (node as { __clipperThreeCleanup?: unknown }).__clipperThreeCleanup;
        if (typeof cleanup === "function") cleanup();
      }
      root.replaceChildren();
    };
  }, [content]);

  return <div ref={ref} className="h-full w-full" />;
}
