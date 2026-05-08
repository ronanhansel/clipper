import { Component as ReactComponent, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent, type ReactNode, type RefObject, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { selectorBlue, selectorHandleSizePx, selectorOffsetPx } from "../../app/config";
import { getRenderableTextSegments, getSelectionFormatState, normalizeEditableFormatting, renderRichTextSegments, richTextSegmentsFromElement, shouldPersistRichText, textSegmentsToEditableNodes } from "../../app/richText";
import { evaluateLayerAnimation } from "../../core/animations";
import { applyAdjustmentLayersToVisualStyle } from "../../core/adjustments";
import { boundsToViewport, formatCameraPreviewFilter, formatCameraPreviewTransform, getLayeredCameraPreviewTransform, type CameraPreviewTransform } from "../../core/camera";
import { getFrameObjectWithPreviewBounds, insetBounds, isVisibleMarqueeBounds, updateDragSelectionBoxElement, type ObjectSnapGuide, type ResizeHandle } from "../../core/frameInteraction";
import { clamp } from "../../core/math";
import { getRenderClockAttributes, getRenderClockStyle, syncDomAnimationsToRenderClock, waitForRenderClockAnimationsReady } from "../../render-engine/renderClock";
import { evaluateBackgroundLayer, evaluateFrameObject, isTimeSensitiveFrameObject, type EvaluatedFrameObject } from "../../render-engine/renderRuntime";
import { applyTransitionLayersToVisualStyle, getTransitionFinishTime, getTransitionProgress, renderTransitionSequence } from "../../core/transitions";
import { FRAME_HEIGHT, FRAME_WIDTH, type AdjustmentLayer, type BackgroundLayer, type Bounds, type FrameObject, type Part, type Point, type RichTextSegment, type SelectionPayload, type TimelineMode, type TimelineMotionLayerState, type TransitionLayer } from "../../core/types";
import type { AdjustmentVisualOverlay, TransitionSequenceStyle, TransitionVisualOverlay } from "../../core/effects/types";
import type { PlaybackClock } from "../../app/types";
import { rasterizeSvgForExport, shouldPreRasterizeSvgForExport, type SvgRasterResult } from "./exportSvgRasterCache";
import { WebGlPipeline } from "../../render-engine/webgl/WebGlPipeline";

const identityCameraTransform: CameraPreviewTransform = { x: 0, y: 0, z: 0, scale: 1, rotation: 0, rotateX: 0, rotateY: 0, perspective: 1800, motionBlur: 0 };

type ExportTileViewport = { x: number; y: number; width: number; height: number };
type ExportTileFrameBounds = { x: number; y: number; width: number; height: number };

export const FramePreview = memo(function FramePreview({ cameraRef, dragBox, dragSelectionBoxRef, framePickPoint, focusPicking, trackerPicking, canSelectObjects, cameraTransform, frameViewportRef, frameScale, isPlaying, part, partStart, adjustmentLayers, playbackClock, previewTime, sceneTime, timelineMode, motionLayers, hiddenMotionLayerIds, pickingTranslationPosition, pickingZoomFocus, compHidden, selectedObjects, marqueeDragging, editingTextObjectId, onFramePointerCancel, onFramePointerDown, onFramePointerDownCapture, onFramePointerMove, onFramePointerUp, onObjectPointerDown, onObjectResizePointerDown, onObjectCornerRadiusChange, onTextEditCommit, onTextObjectDoubleClick, onTrackerTargetPick }: { cameraRef: RefObject<HTMLDivElement | null>; dragBox: Bounds | null; dragSelectionBoxRef: RefObject<HTMLDivElement | null>; framePickPoint: Point | null; focusPicking: boolean; trackerPicking: boolean; canSelectObjects: boolean; cameraTransform: CameraPreviewTransform; frameViewportRef: RefObject<HTMLDivElement | null>; frameScale: number; isPlaying: boolean; part: Part; partStart: number; adjustmentLayers?: AdjustmentLayer[]; playbackClock: PlaybackClock; previewTime: number; sceneTime: number; timelineMode: TimelineMode; motionLayers: TimelineMotionLayerState[]; hiddenMotionLayerIds?: Set<string>; pickingTranslationPosition: boolean; pickingZoomFocus: boolean; compHidden?: boolean; selectedObjects: SelectionPayload["objects"]; objectSnapGuides?: ObjectSnapGuide[]; marqueeDragging: boolean; editingTextObjectId: string | null; onFramePointerCancel: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerDown: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerDownCapture: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerMove: (event: PointerEvent<HTMLDivElement>) => void; onFramePointerUp: (event: PointerEvent<HTMLDivElement>) => void; onObjectPointerDown: (event: PointerEvent<HTMLDivElement>, object: FrameObject) => void; onObjectResizePointerDown: (event: PointerEvent<HTMLDivElement>, handle: ResizeHandle, objectId?: string) => void; onObjectCornerRadiusChange?: (objectId: string, radius: number) => void; onTextEditCommit: (objectId: string, content: string, richText?: RichTextSegment[]) => void; onTextObjectDoubleClick: (event: ReactMouseEvent<HTMLDivElement>, object: FrameObject) => void; onTrackerTargetPick: (objectId: string) => void }) {
  const exportTileViewport = (arguments[0] as { exportTileViewport?: ExportTileViewport }).exportTileViewport;
  const exportTileFrameBounds = useMemo(() => exportTileViewport ? ({ x: exportTileViewport.x / frameScale, y: exportTileViewport.y / frameScale, width: exportTileViewport.width / frameScale, height: exportTileViewport.height / frameScale }) : undefined, [exportTileViewport, frameScale]);
  const viewportStyle = useMemo(() => ({ width: exportTileViewport?.width ?? FRAME_WIDTH * frameScale, height: exportTileViewport?.height ?? FRAME_HEIGHT * frameScale }) as CSSProperties, [exportTileViewport?.height, exportTileViewport?.width, frameScale]);
  const selectionOverlayScale = Math.max((arguments[0] as { selectionOverlayScale?: number }).selectionOverlayScale ?? 1, 0.001);
  const selectionOffsetPx = selectorOffsetPx / selectionOverlayScale;
  const selectionHandleSizePx = selectorHandleSizePx / selectionOverlayScale;
  const animationsEnabled = true;
  const compositionRenderMode = part.renderMode ?? "dom";
  const previewParts = (arguments[0] as { previewParts?: Array<{ part: Part; start: number; previewTime: number }> }).previewParts;
  const transitionPreviewParts = (arguments[0] as { transitionPreviewParts?: { from: Array<{ part: Part; start: number; previewTime: number }>; to: Array<{ part: Part; start: number; previewTime: number }>; fromSceneTime: number; toSceneTime: number } | null }).transitionPreviewParts;
  const transitionLayers = (arguments[0] as { transitionLayers?: TransitionLayer[] }).transitionLayers;
  const renderMode = (arguments[0] as { renderMode?: "preview" | "export" }).renderMode ?? "preview";
  const previewOverlayHost = (arguments[0] as { previewOverlayHost?: HTMLElement | null }).previewOverlayHost;
  const objectSnapGuides = (arguments[0] as { objectSnapGuides?: ObjectSnapGuide[] }).objectSnapGuides ?? [];
  const composePlaybackActive = timelineMode === "compose" && isPlaying;
  const interactiveDragBox = composePlaybackActive ? null : dragBox;
  const interactiveFramePickPoint = composePlaybackActive ? null : framePickPoint;
  const interactiveFocusPicking = composePlaybackActive ? false : focusPicking;
  const interactiveTrackerPicking = composePlaybackActive ? false : trackerPicking;
  const interactiveSelectedObjects = composePlaybackActive ? [] : selectedObjects;
  const interactiveObjectSnapGuides = composePlaybackActive ? [] : objectSnapGuides;
  const interactiveEditingTextObjectId = composePlaybackActive ? null : editingTextObjectId;
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
    return getLayeredCameraPreviewTransform(part, motionLayers, displayPreviewTime, { hiddenLayerIds: hiddenMotionLayerIds, pickingTranslationPosition: composePlaybackActive ? false : pickingTranslationPosition, pickingZoomFocus: composePlaybackActive ? false : pickingZoomFocus, resetMotionEffects: interactiveTrackerPicking || interactiveFocusPicking || (!composePlaybackActive && pickingTranslationPosition) || (!composePlaybackActive && pickingZoomFocus) });
  }, [cameraTransform, composePlaybackActive, displayPreviewTime, hiddenMotionLayerIds, interactiveFocusPicking, interactiveTrackerPicking, motionLayers, part, pickingTranslationPosition, pickingZoomFocus, timelineMode]);
  const liveCameraTransform = useTransitionComposite ? identityCameraTransform : activeCameraTransform;
  const frameBackground = part.frame.style.background ?? "#000";
  const frameStyle = useMemo(() => ({ width: FRAME_WIDTH, height: FRAME_HEIGHT, background: frameBackground, left: exportTileViewport ? -exportTileViewport.x : 0, top: exportTileViewport ? -exportTileViewport.y : 0, transform: frameScale === 1 ? undefined : `scale(${frameScale})` }) as CSSProperties, [exportTileViewport, frameBackground, frameScale]);
  const perspectiveStageStyle = useMemo(() => ({ perspective: `${liveCameraTransform.perspective}px`, perspectiveOrigin: "center", transformStyle: "preserve-3d" }) as CSSProperties, [liveCameraTransform.perspective]);
  const selectableObjects = useMemo(() => [...part.background.elements, ...part.objects], [part.background.elements, part.objects]);
  const selectedPreviewObjects = useMemo(() => interactiveSelectedObjects.map((selected) => {
    const object = selectableObjects.find((item) => item.id === selected.id);
    return object ? { ...selected, bounds: getFrameObjectWithPreviewBounds(object, displayPreviewTime, part.duration).bounds } : selected;
  }), [displayPreviewTime, interactiveSelectedObjects, part.duration, selectableObjects]);
  const viewportOverlayStyle = useMemo(() => exportTileViewport ? ({ width: exportTileViewport.width, height: exportTileViewport.height }) as CSSProperties : ({ width: FRAME_WIDTH * frameScale, height: FRAME_HEIGHT * frameScale }) as CSSProperties, [exportTileViewport, frameScale]);
  const clippedViewportStyle = useMemo(() => ({ ...viewportStyle, left: 0, top: 0 }) as CSSProperties, [viewportStyle]);
  const [trackerHoverTarget, setTrackerHoverTarget] = useState<{ id: string; viewportBounds: Bounds } | null>(null);
  const [hoveredObjectId, setHoveredObjectId] = useState<string | null>(null);
  const hoveredObjectIdRef = useRef<string | null>(null);
  const showDragBox = interactiveDragBox && isVisibleMarqueeBounds(interactiveDragBox, frameScale);
  const isUnlinkedPart = Boolean(part.sourceMissing);
  const compositionError = part.compositionError;
  const livePlaybackPartRef = useRef(part);
  const livePlaybackClockRef = useRef(playbackClock);
  livePlaybackPartRef.current = part;
  livePlaybackClockRef.current = playbackClock;
  const stackPreviewParts = previewParts?.length ? previewParts : [{ part, start: partStart, previewTime }];

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
    for (const element of document.elementsFromPoint(event.clientX, event.clientY)) {
      const radiusHandle = element instanceof HTMLElement ? element.closest<HTMLElement>("[data-radius-handle-object-id]") : null;
      if (radiusHandle?.dataset.radiusHandleObjectId) {
        nextId = radiusHandle.dataset.radiusHandleObjectId;
        break;
      }
      const target = element instanceof HTMLElement ? element.closest<HTMLElement>("[data-object-id]") : null;
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
    if (interactiveTrackerPicking) updateTrackerHover(event);
    updateObjectHover(event);
    onFramePointerMove(event);
  }

  function handleFramePointerDownCapture(event: PointerEvent<HTMLDivElement>) {
    if (isPlaying) return;
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

  function clearSelectorHover(event?: PointerEvent<HTMLDivElement>) {
    const relatedTarget = event?.relatedTarget;
    if (relatedTarget instanceof HTMLElement && relatedTarget.closest("[data-radius-handle-object-id]")) return;
    if (hoveredObjectIdRef.current) {
      hoveredObjectIdRef.current = null;
      setHoveredObjectId(null);
    }
    setTrackerHoverTarget(null);
  }

  return (
    <div data-clipper-frame-preview-wrapper>
      <div className="relative overflow-visible" data-clipper-frame-preview-shell style={viewportOverlayStyle}>
          <div ref={frameViewportRef} className={`absolute overflow-hidden ${!isPlaying && (interactiveFocusPicking || interactiveTrackerPicking) ? "cursor-crosshair ring-2 ring-[#159dff]" : ""}`} data-clipper-frame-preview style={clippedViewportStyle} onPointerDownCapture={handleFramePointerDownCapture} onPointerDown={isPlaying ? undefined : onFramePointerDown} onPointerMove={handleFramePointerMove} onPointerUp={isPlaying ? undefined : onFramePointerUp} onPointerCancel={isPlaying ? undefined : onFramePointerCancel} onPointerLeave={clearSelectorHover}>
          <div className="absolute left-0 top-0 origin-top-left overflow-hidden" data-clipper-frame-content style={frameStyle}>
            <div className="absolute inset-0" data-clipper-perspective-stage style={perspectiveStageStyle}>
              {isUnlinkedPart || compHidden || compositionError ? <div className="absolute inset-0 bg-black" ref={cameraRef}>{compositionError ? <CompositionErrorOverlay filePath={part.filePath} message={compositionError} /> : null}</div> : <div className="absolute inset-0 origin-center" ref={cameraRef} style={{ transformStyle: "preserve-3d", ...transitionCameraStyle }}>
                <div className="absolute inset-0" data-clipper-visual-adjustments style={visualAdjustmentStyle}>
                  <FramePreviewRenderBoundary filePath={part.filePath} resetKey={`${part.id}:${part.filePath}:${compositionError ?? ""}`}>
                    {compositionRenderMode === "webgl"
                      ? <WebGlPipeline graph={part.composition3dGraph} frameScale={frameScale} isPlaying={isPlaying} partDuration={part.duration} partStart={partStart} previewTime={previewTime} trimStart={part.trimStart} playbackClock={playbackClock} />
                      : transitionPreviewParts && transitionProgress !== null
                      ? <TransitionCompositeView adjustmentLayers={adjustmentLayers} animationsEnabled={animationsEnabled} exportTileFrameBounds={exportTileFrameBounds} frameScale={frameScale} isPlaying={isPlaying} renderMode={renderMode} sequenceStyle={transitionSequenceStyle} transitionPreviewParts={transitionPreviewParts} />
                      : stackPreviewParts.map((item) => <CompositionLayerView key={`${item.part.id}:${item.start}`} active={item.part.id === part.id} animationsEnabled={animationsEnabled} canSelect={!isPlaying && (canSelectObjects || interactiveTrackerPicking)} editingTextObjectId={interactiveEditingTextObjectId} exportTileFrameBounds={exportTileFrameBounds} focusPicking={!isPlaying && (interactiveFocusPicking || interactiveTrackerPicking)} frameScale={frameScale} isPlaying={isPlaying} part={item.part} previewTime={item.previewTime} renderMode={renderMode} onObjectPointerDown={onObjectPointerDown} onTextEditCommit={onTextEditCommit} onTextObjectDoubleClick={onTextObjectDoubleClick} />)}
                  </FramePreviewRenderBoundary>
                  <div ref={frameVisualAdjustmentOverlaysRef} className="pointer-events-none absolute inset-0" data-clipper-visual-adjustment-overlays="frame" style={{ zIndex: 2147483647 }} />
                </div>
              </div>}
            </div>
            <div ref={cameraVisualAdjustmentOverlaysRef} className="pointer-events-none absolute inset-0" data-clipper-visual-adjustment-overlays="camera" style={{ zIndex: 2147483647 }} />
          </div>
          {interactiveTrackerPicking && trackerHoverTarget ? <TrackerTargetOverlay target={trackerHoverTarget} /> : null}
          {interactiveDragBox ? <DragSelectionBox dragSelectionBoxRef={dragSelectionBoxRef} bounds={interactiveDragBox} frameScale={frameScale} frameViewportRef={frameViewportRef} portalHost={previewOverlayHost} uiScale={selectionOverlayScale} visible={Boolean(showDragBox)} /> : null}
          {interactiveObjectSnapGuides.map((guide, index) => <SnapGuideOverlay key={`${guide.axis}:${guide.position}:${index}`} cameraTransform={liveCameraTransform} guide={guide} frameScale={frameScale} />)}
          {interactiveFramePickPoint ? <FramePickPointOverlay point={interactiveFramePickPoint} frameScale={frameScale} /> : null}
          <FramePickPointImperativeOverlay />
        </div>
      </div>
      {canSelectObjects && !isUnlinkedPart && previewOverlayHost ? createPortal(selectedPreviewObjects.map((object) => {
        const source = selectableObjects.find((item) => item.id === object.id);
        return <SelectionOverlayBox key={object.id} objectId={object.id} bounds={object.bounds} cameraTransform={liveCameraTransform} frameScale={frameScale} frameViewportRef={frameViewportRef} handleSizePx={selectionHandleSizePx} highlighted={hoveredObjectId === object.id} interactive={!marqueeDragging} offsetPx={selectionOffsetPx} portal portalHost={previewOverlayHost} radius={source?.type === "rect" ? getNumericStyleValue(source.style.borderRadius) : undefined} uiScale={selectionOverlayScale} onCornerRadiusChange={onObjectCornerRadiusChange ? (radius) => onObjectCornerRadiusChange(object.id, radius) : undefined} onResizePointerDown={(event, handle) => onObjectResizePointerDown(event, handle, object.id)} />;
      }), previewOverlayHost) : null}
    </div>
  );
});

class FramePreviewRenderBoundary extends ReactComponent<{ children: ReactNode; filePath: string; resetKey: string }, { error: string | null }> {
  state: { error: string | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: framePreviewErrorMessage(error) };
  }

  componentDidUpdate(previousProps: { resetKey: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  componentDidCatch(error: unknown) {
    console.error("FramePreview render failed", error);
  }

  render() {
    if (this.state.error) return <CompositionErrorOverlay filePath={this.props.filePath} message={this.state.error} title="Preview render failed" />;
    return this.props.children;
  }
}

function CompositionErrorOverlay({ filePath, message, title = "Composition failed to load" }: { filePath: string; message: string; title?: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#07090d] p-16 text-[#ffd6d6]">
      <div className="max-w-[1080px] rounded-[28px] border border-[#5a222c] bg-[#1a0f13]/95 p-10 shadow-[0_26px_90px_rgba(0,0,0,0.55)]">
        <div className="text-[22px] font-extrabold tracking-tight text-[#ff6b7a]">{title}</div>
        <div className="mt-2 break-all font-mono text-[15px] text-[#a7adbb]">{filePath}</div>
        <pre className="mt-6 max-h-[560px] overflow-auto whitespace-pre-wrap rounded-[18px] border border-[#3b2a2a] bg-[#090b10] p-5 font-mono text-[20px] leading-relaxed text-[#ffd6d6]">{message}</pre>
      </div>
    </div>
  );
}

function framePreviewErrorMessage(error: unknown) {
  return error instanceof Error ? error.stack ?? error.message : String(error);
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

 function CompositionLayerView({ active, animationsEnabled, canSelect, editingTextObjectId, exportTileFrameBounds, focusPicking, frameScale, isPlaying, part, previewTime, renderMode, onObjectPointerDown, onTextEditCommit, onTextObjectDoubleClick }: { active: boolean; animationsEnabled: boolean; canSelect: boolean; editingTextObjectId: string | null; exportTileFrameBounds?: ExportTileFrameBounds; focusPicking: boolean; frameScale: number; isPlaying: boolean; part: Part; previewTime: number; renderMode: "preview" | "export"; onObjectPointerDown: (event: PointerEvent<HTMLDivElement>, object: FrameObject) => void; onTextEditCommit: (objectId: string, content: string, richText?: RichTextSegment[], bounds?: Bounds) => void; onTextObjectDoubleClick: (event: ReactMouseEvent<HTMLDivElement>, object: FrameObject) => void }) {
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
        <FrameObjectView key={object.id} animationsEnabled={animationsEnabled} exportTileFrameBounds={exportTileFrameBounds} object={object} canSelect={active && canSelect} duration={part.duration} editing={active && !isPlaying && editingTextObjectId === object.id} focusPicking={active && focusPicking} frameScale={frameScale} previewTime={previewTime} renderMode={renderMode} onDoubleClick={(event) => { if (active && !isPlaying) onTextObjectDoubleClick(event, object); }} onPointerDown={(event) => { if (active && !isPlaying) onObjectPointerDown(event, object); }} onTextEditCommit={(content, richText, bounds) => onTextEditCommit(object.id, content, richText, bounds)} />
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

function SnapGuideOverlay({ cameraTransform, guide, frameScale }: { cameraTransform: CameraPreviewTransform; guide: ObjectSnapGuide; frameScale: number }) {
  const viewportBounds = guide.axis === "x"
    ? boundsToViewport({ x: guide.position, y: 0, width: 0, height: FRAME_HEIGHT }, cameraTransform, frameScale)
    : boundsToViewport({ x: 0, y: guide.position, width: FRAME_WIDTH, height: 0 }, cameraTransform, frameScale);
  const style = guide.axis === "x"
    ? { left: viewportBounds.x, top: viewportBounds.y, width: 1, height: viewportBounds.height }
    : { left: viewportBounds.x, top: viewportBounds.y, width: viewportBounds.width, height: 1 };
  return <div className="pointer-events-none absolute bg-red-500 shadow-[0_0_0_1px_rgba(239,68,68,0.35)]" data-clipper-object-snap-guide style={{ ...style, zIndex: 80 }} />;
}

function FramePickPointImperativeOverlay() {
  return (
    <div className="pointer-events-none absolute z-20 opacity-0" data-clipper-motion-pick-preview style={{ transform: "translate3d(0px, 0px, 0)" }}>
      <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-[#159dff] shadow-[0_2px_8px_rgba(0,0,0,0.38)]" />
    </div>
  );
}

export const FrameObjectView = memo(function FrameObjectView({ animationsEnabled, exportTileFrameBounds, object, canSelect, duration, editing, focusPicking, frameScale, previewTime, renderMode, onDoubleClick, onPointerDown, onTextEditCommit }: { animationsEnabled: boolean; exportTileFrameBounds?: ExportTileFrameBounds; object: FrameObject; canSelect: boolean; duration: number; editing: boolean; focusPicking: boolean; frameScale: number; previewTime: number; renderMode: "preview" | "export"; onDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void; onPointerDown: (event: PointerEvent<HTMLDivElement>) => void; onTextEditCommit: (content: string, richText?: RichTextSegment[], bounds?: Bounds) => void }) {
  const evaluatedObject = useMemo(() => evaluateObjectForPreview(object, previewTime, duration, animationsEnabled), [animationsEnabled, duration, object, previewTime]);
  const animation = { style: evaluatedObject.renderStyle, content: evaluatedObject.renderContent };
  const objectRef = useRef<HTMLDivElement | null>(null);
  const editableRef = useRef<HTMLDivElement | null>(null);
  const lastCommittedTextRef = useRef<string | null>(null);
  const wasEditingRef = useRef(false);
  const objectTransform = typeof object.style.transform === "string" ? object.style.transform : undefined;
  const animationTransform = typeof animation.style.transform === "string" ? animation.style.transform : undefined;
  const verticalAlign = object.type === "text" ? String(object.style.verticalAlign ?? "middle") : "middle";
  const textBoxLayout = object.type === "text" ? String(object.style.textBoxLayout ?? "fixed") : "fixed";
  const textWrapClass = textBoxLayout === "overflow" ? "whitespace-pre" : "whitespace-pre-wrap";
  const style = {
    ...object.style,
    ...animation.style,
    left: renderMode === "export" ? object.bounds.x : `var(--clipper-resize-left, ${object.bounds.x}px)`,
    top: renderMode === "export" ? object.bounds.y : `var(--clipper-resize-top, ${object.bounds.y}px)`,
    width: renderMode === "export" ? object.bounds.width : `var(--clipper-resize-width, ${object.bounds.width}px)`,
    height: textBoxLayout === "auto-height" ? "auto" : renderMode === "export" ? object.bounds.height : `var(--clipper-resize-height, ${object.bounds.height}px)`,
    minHeight: textBoxLayout === "auto-height" ? object.bounds.height : undefined,
    fontSize: object.type === "text" && renderMode !== "export" ? `calc(${formatStyleLength(object.style.fontSize)} * var(--clipper-scale-preview, 1))` : object.style.fontSize,
    borderRadius: renderMode === "export" ? object.style.borderRadius : `var(--clipper-radius-preview, ${formatStyleLength(object.style.borderRadius)})`,
    transform: renderMode === "export" ? (animationTransform ?? objectTransform) : `translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px)) ${animationTransform ?? objectTransform ?? ""}`.trim(),
    justifyContent: verticalAlign === "top" ? "flex-start" : verticalAlign === "bottom" ? "flex-end" : "center",
    willChange: renderMode === "export" ? undefined : "transform",
  } as CSSProperties;
  const content = animation.content ?? object.content;
  const richText = evaluatedObject.renderRichText;
  const textSegments = useMemo(() => getRenderableTextSegments(content ?? "", richText), [content, richText]);
  const splitTextAnimations = animationsEnabled && object.type === "text" ? object.animations?.filter((item) => item.enabled !== false && item.options.split) ?? [] : [];

  useLayoutEffect(() => {
    const element = objectRef.current;
    if (!element || renderMode === "export") return;
    element.style.removeProperty("--clipper-resize-left");
    element.style.removeProperty("--clipper-resize-top");
    element.style.removeProperty("--clipper-resize-width");
    element.style.removeProperty("--clipper-resize-height");
    element.style.removeProperty("--clipper-scale-preview");
  }, [object.bounds.height, object.bounds.width, object.bounds.x, object.bounds.y, renderMode]);

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
    const nextBounds = textBoxLayout === "auto-height" ? getAutoHeightTextBounds(object, editableRef.current) : undefined;
    if (nextCommittedText === lastCommittedTextRef.current && !nextBounds) return;
    lastCommittedTextRef.current = nextCommittedText;
    onTextEditCommit(content, nextRichText, nextBounds);
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
    <div ref={objectRef} className={`absolute flex touch-none select-none flex-col whitespace-pre-line ${textBoxLayout === "fixed" ? "overflow-hidden" : "overflow-visible"} ${focusPicking ? "cursor-crosshair" : editing ? "cursor-text" : "cursor-default"} ${editing ? "select-text" : ""}`} data-clipper-render-object-id={object.id} data-object-id={canSelect && !isLocked ? object.id : undefined} style={{ ...style, ...(isLocked ? { opacity: 0.6 } : {}) }} onDoubleClick={(event) => { if (!isLocked) onDoubleClick(event); }} onPointerDown={(event) => { if (!isLocked) onPointerDown(event); }}>
      {object.type === "text" && editing ? <div ref={editableRef} className={`min-h-0 w-full outline-none ${textWrapClass}`} contentEditable suppressContentEditableWarning onBlur={commitTextEdit} onInput={commitTextEdit} onKeyDown={onTextEditKeyDown} onPointerDown={(event) => event.stopPropagation()} /> : null}
      {object.type === "text" && !editing ? <div className={`min-h-0 w-full ${textWrapClass}`}>{splitTextAnimations.length ? renderSplitTextSegments(textSegments, Boolean(richText), splitTextAnimations, previewTime) : renderRichTextSegments(textSegments, Boolean(richText))}</div> : null}
      {object.type === "svg" && content ? <ExportSvgContent bounds={object.bounds} content={content} exportTileFrameBounds={exportTileFrameBounds} frameScale={frameScale} markupKind="svg" owner={{ id: object.id, name: object.name, type: object.type, layer: "object" }} renderMode={renderMode} style={style} /> : null}
      {(object.type === "html" || object.type === "template") && content ? <HtmlContent content={content} /> : null}
      {object.type !== "text" && object.type !== "svg" && object.type !== "html" && object.type !== "template" && content ? content : null}
    </div>
  );
}, areFrameObjectPropsEqual);

type SplitTextToken = {
  key: string;
  text: string;
  animated: boolean;
  style: CSSProperties;
};

function renderSplitTextSegments(segments: RichTextSegment[], explicitFormatting: boolean, animations: NonNullable<FrameObject["animations"]>, time: number) {
  const tokens = tokenizeTextSegments(segments, explicitFormatting, animations[0]?.options.split?.mode ?? "word");
  const animatedCount = tokens.filter((token) => token.animated).length;
  let animatedIndex = 0;
  return tokens.map((token) => {
    if (token.text === "\n") return <br key={token.key} />;
    if (!token.animated) return <span key={token.key} style={token.style}>{token.text}</span>;
    const tokenStyle = getSplitTextTokenStyle(animations, time, animatedIndex, animatedCount);
    animatedIndex += 1;
    return <span key={token.key} style={{ ...token.style, ...tokenStyle, display: "inline-block", whiteSpace: "pre" }}>{token.text}</span>;
  });
}

function tokenizeTextSegments(segments: RichTextSegment[], explicitFormatting: boolean, mode: "word" | "character") {
  const tokens: SplitTextToken[] = [];
  segments.forEach((segment, segmentIndex) => {
    const style = textSegmentInlineStyle(segment, explicitFormatting);
    if (mode === "character") {
      Array.from(segment.text).forEach((char, charIndex) => tokens.push({ key: `${segmentIndex}:char:${charIndex}`, text: char, animated: char !== "\n" && !/\s/.test(char), style }));
      return;
    }
    const parts = segment.text.match(/\n|\s+|\S+/g) ?? [];
    parts.forEach((part, partIndex) => tokens.push({ key: `${segmentIndex}:word:${partIndex}`, text: part, animated: part !== "\n" && !/^\s+$/.test(part), style }));
  });
  return tokens;
}

function textSegmentInlineStyle(segment: RichTextSegment, explicitFormatting: boolean): CSSProperties {
  return {
    fontWeight: segment.bold ? 700 : explicitFormatting ? 400 : undefined,
    fontStyle: segment.italic ? "italic" : explicitFormatting ? "normal" : undefined,
    textDecorationLine: segment.underline ? "underline" : explicitFormatting ? "none" : undefined,
  };
}

function getSplitTextTokenStyle(animations: NonNullable<FrameObject["animations"]>, time: number, index: number, count: number) {
  const combined: CSSProperties = {};
  for (const animation of animations) {
    const split = animation.options.split;
    if (!split) continue;
    const tokenOffset = getSplitTokenOrderIndex(index, count, split.order ?? "forward") * (split.stagger ?? 0);
    const tokenTime = split.repeatScope === "item"
      ? time - tokenOffset
      : getSequenceRepeatTokenTime(animation, time, tokenOffset, count);
    const style = evaluateLayerAnimation(split.repeatScope === "item" ? animation : { ...animation, options: { ...animation.options, repeat: undefined, repeatDelay: undefined } }, tokenTime);
    for (const key in style) {
      if (key === "transform" && combined.transform && style.transform) combined.transform = `${combined.transform} ${style.transform}`;
      else if (style[key] !== undefined) combined[key as keyof CSSProperties] = style[key] as never;
    }
  }
  return combined;
}

function getSplitTokenOrderIndex(index: number, count: number, order: "forward" | "reverse" | "center") {
  if (order === "reverse") return count - index - 1;
  if (order === "center") return Math.abs(index - (count - 1) / 2);
  return index;
}

function getSequenceRepeatTokenTime(animation: NonNullable<FrameObject["animations"]>[number], time: number, tokenOffset: number, count: number) {
  const { delay = 0, duration, repeat, repeatDelay = 0, split } = animation.options;
  const stagger = split?.stagger ?? 0;
  const sequenceDuration = Math.max(duration + Math.max(0, count - 1) * stagger, 0.0001);
  const cycleDuration = sequenceDuration + repeatDelay;
  if (time < delay) return time - tokenOffset;
  const elapsed = time - delay;
  if (repeat === undefined) return time - tokenOffset;
  if (repeat !== Infinity) {
    const totalDuration = sequenceDuration + repeat * cycleDuration;
    if (elapsed >= totalDuration) return delay + sequenceDuration - tokenOffset;
  }
  const cycleElapsed = elapsed % cycleDuration;
  if (cycleElapsed >= sequenceDuration) return delay + sequenceDuration - tokenOffset;
  return delay + cycleElapsed - tokenOffset;
}

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

export function SelectionOverlayBox({ objectId, bounds, cameraTransform, frameScale, frameViewportRef, handleSizePx = selectorHandleSizePx, highlighted, interactive, offsetPx = selectorOffsetPx, overlayOffset = { left: 0, top: 0 }, portal = false, portalHost, radius, uiScale = 1, onCornerRadiusChange, onResizePointerDown }: { objectId: string; bounds: Bounds; cameraTransform: CameraPreviewTransform; frameScale: number; frameViewportRef?: RefObject<HTMLDivElement | null>; handleSizePx?: number; highlighted: boolean; interactive: boolean; offsetPx?: number; overlayOffset?: { left: number; top: number }; portal?: boolean; portalHost?: HTMLElement | null; radius?: number; uiScale?: number; onCornerRadiusChange?: (radius: number) => void; onResizePointerDown: (event: PointerEvent<HTMLDivElement>, handle: ResizeHandle) => void }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const radiusDragRef = useRef<{ corner: "top-left" | "top-right" | "bottom-right" | "bottom-left"; startClientX: number; startClientY: number; startRadius: number; objectUnitsPerScreenPx: number } | null>(null);
  const pendingRadiusRef = useRef<number | null>(null);
  const [dragRadius, setDragRadius] = useState<number | null>(null);
  const [optimisticRadius, setOptimisticRadius] = useState<number | null>(null);
  const [radiusHandleHover, setRadiusHandleHover] = useState(false);
  const [objectResizingActive, setObjectResizingActive] = useState(false);
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
  const maxRadius = Math.max(0, Math.min(bounds.width, bounds.height) / 2);
  const displayRadius = clamp(dragRadius ?? optimisticRadius ?? radius ?? 0, 0, maxRadius);
  const showRadiusHandles = Boolean(!objectResizingActive && interactive && onCornerRadiusChange && radius !== undefined && (highlighted || radiusHandleHover || dragRadius !== null));
  const objectViewportWidth = Math.max(viewportBounds.width - offsetPx * 2, 1);
  const objectViewportHeight = Math.max(viewportBounds.height - offsetPx * 2, 1);
  const objectLeftPercent = viewportBounds.width > 0 ? offsetPx / viewportBounds.width * 100 : 0;
  const objectTopPercent = viewportBounds.height > 0 ? offsetPx / viewportBounds.height * 100 : 0;
  const objectWidthPercent = viewportBounds.width > 0 ? objectViewportWidth / viewportBounds.width * 100 : 100;
  const objectHeightPercent = viewportBounds.height > 0 ? objectViewportHeight / viewportBounds.height * 100 : 100;
  const radiusProgressX = clamp(displayRadius / Math.max(bounds.width, 1), 0, 0.5);
  const radiusProgressY = clamp(displayRadius / Math.max(bounds.height, 1), 0, 0.5);
  const minRadiusHandleInsetPx = 20;
  const minRadiusHandleInsetXPercent = viewportBounds.width > 0 ? minRadiusHandleInsetPx / viewportBounds.width * 100 : 0;
  const minRadiusHandleInsetYPercent = viewportBounds.height > 0 ? minRadiusHandleInsetPx / viewportBounds.height * 100 : 0;
  const radiusInsetXPercent = clamp(radiusProgressX * objectWidthPercent, minRadiusHandleInsetXPercent, objectWidthPercent / 2);
  const radiusInsetYPercent = clamp(radiusProgressY * objectHeightPercent, minRadiusHandleInsetYPercent, objectHeightPercent / 2);
  const radiusLeftPercent = objectLeftPercent + radiusInsetXPercent;
  const radiusRightPercent = objectLeftPercent + objectWidthPercent - radiusInsetXPercent;
  const radiusTopPercent = objectTopPercent + radiusInsetYPercent;
  const radiusBottomPercent = objectTopPercent + objectHeightPercent - radiusInsetYPercent;
  const radiusTopLeftStyle = { left: `${radiusLeftPercent}%`, top: `${radiusTopPercent}%` };
  const radiusTopRightStyle = { left: `${radiusRightPercent}%`, top: `${radiusTopPercent}%` };
  const radiusBottomRightStyle = { left: `${radiusRightPercent}%`, top: `${radiusBottomPercent}%` };
  const radiusBottomLeftStyle = { left: `${radiusLeftPercent}%`, top: `${radiusBottomPercent}%` };
  const radiusHandleClass = "absolute z-20 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#159dff] bg-white cursor-default pointer-events-auto";
  const topLeftHandleClass = `${handleClass} left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize`;
  const topRightHandleClass = `${handleClass} right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize`;
  const bottomRightHandleClass = `${handleClass} bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize`;
  const bottomLeftHandleClass = `${handleClass} bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize`;
  const boxStyle = portal
    ? { left: "var(--clipper-selection-preview-left, var(--clipper-selection-base-left, 0px))", top: "var(--clipper-selection-preview-top, var(--clipper-selection-base-top, 0px))", width: "var(--clipper-selection-preview-width, var(--clipper-selection-base-width, 0px))", height: "var(--clipper-selection-preview-height, var(--clipper-selection-base-height, 0px))", position: "absolute", transform: "translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px))", willChange: "left, top, width, height, transform", zIndex: 70 } as CSSProperties
    : { left: `var(--clipper-selection-preview-left, ${viewportBounds.x + overlayOffset.left}px)`, top: `var(--clipper-selection-preview-top, ${viewportBounds.y + overlayOffset.top}px)`, width: `var(--clipper-selection-preview-width, ${viewportBounds.width}px)`, height: `var(--clipper-selection-preview-height, ${viewportBounds.height}px)`, transform: "translate(var(--clipper-drag-x, 0px), var(--clipper-drag-y, 0px))", zIndex: 70 } as CSSProperties;

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
        element.style.setProperty("--clipper-selection-base-left", `${frameRect.left - hostRect.left + viewportBounds.x * scale}px`);
        element.style.setProperty("--clipper-selection-base-top", `${frameRect.top - hostRect.top + viewportBounds.y * scale}px`);
        element.style.setProperty("--clipper-selection-base-width", `${viewportBounds.width * scale}px`);
        element.style.setProperty("--clipper-selection-base-height", `${viewportBounds.height * scale}px`);
      }
      frameId = requestAnimationFrame(syncPortalBox);
    }

    syncPortalBox();
    return () => cancelAnimationFrame(frameId);
  }, [frameScale, frameViewportRef, portal, portalHost, viewportBounds.height, viewportBounds.width, viewportBounds.x, viewportBounds.y]);

  useEffect(() => {
    function updateObjectResizingActive(event: Event) {
      const active = Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active);
      setObjectResizingActive(active);
      if (active) setRadiusHandleHover(false);
    }

    window.addEventListener("clipper:object-resize-active", updateObjectResizingActive);
    return () => window.removeEventListener("clipper:object-resize-active", updateObjectResizingActive);
  }, []);

  useEffect(() => {
    if (optimisticRadius !== null && Math.abs((radius ?? 0) - optimisticRadius) < 0.5) setOptimisticRadius(null);
  }, [optimisticRadius, radius]);

  useEffect(() => {
    if (dragRadius === null && optimisticRadius === null) setObjectRadiusPreview(objectId, null);
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
    const inwardX = drag.corner === "top-right" || drag.corner === "bottom-right" ? -dx : dx;
    const inwardY = drag.corner === "bottom-right" || drag.corner === "bottom-left" ? -dy : dy;
    const dominantDelta = Math.abs(inwardX) >= Math.abs(inwardY) ? inwardX : inwardY;
    const diagonalDelta = dominantDelta * Math.SQRT2;
    const nextRadius = Math.round(clamp(drag.startRadius + diagonalDelta * drag.objectUnitsPerScreenPx, 0, maxRadius));
    setDragRadius(nextRadius);
    setOptimisticRadius(nextRadius);
    previewRadiusChange(nextRadius);
  }

  function startRadiusDrag(event: PointerEvent<HTMLButtonElement>, corner: "top-left" | "top-right" | "bottom-right" | "bottom-left") {
    event.preventDefault();
    event.stopPropagation();
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const insetX = rect.width * clamp(offsetPx / Math.max(viewportBounds.width, 1), 0, 0.45);
    const insetY = rect.height * clamp(offsetPx / Math.max(viewportBounds.height, 1), 0, 0.45);
    const objectWidth = Math.max(rect.width - insetX * 2, 1);
    const objectHeight = Math.max(rect.height - insetY * 2, 1);
    const screenPxPerObjectUnit = Math.max(0.001, Math.min(objectWidth / Math.max(bounds.width, 1), objectHeight / Math.max(bounds.height, 1)));
    radiusDragRef.current = { corner, startClientX: event.clientX, startClientY: event.clientY, startRadius: displayRadius, objectUnitsPerScreenPx: 1 / screenPxPerObjectUnit };
    setDragRadius(displayRadius);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

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
      {showRadiusHandles ? <>
        {dragRadius !== null ? <div className="pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-[9px] bg-[#159dff] px-2.5 py-1 text-xs font-extrabold text-white shadow-[0_10px_26px_rgba(0,0,0,0.32)]">Radius {displayRadius}px</div> : null}
        <button aria-label="Adjust top-left corner radius" className={radiusHandleClass} data-radius-handle-object-id={objectId} style={radiusTopLeftStyle} onPointerEnter={() => setRadiusHandleHover(true)} onPointerLeave={() => setRadiusHandleHover(false)} onPointerDown={(event) => startRadiusDrag(event, "top-left")} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateRadiusFromPointer(event); }} />
        <button aria-label="Adjust top-right corner radius" className={radiusHandleClass} data-radius-handle-object-id={objectId} style={radiusTopRightStyle} onPointerEnter={() => setRadiusHandleHover(true)} onPointerLeave={() => setRadiusHandleHover(false)} onPointerDown={(event) => startRadiusDrag(event, "top-right")} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateRadiusFromPointer(event); }} />
        <button aria-label="Adjust bottom-right corner radius" className={radiusHandleClass} data-radius-handle-object-id={objectId} style={radiusBottomRightStyle} onPointerEnter={() => setRadiusHandleHover(true)} onPointerLeave={() => setRadiusHandleHover(false)} onPointerDown={(event) => startRadiusDrag(event, "bottom-right")} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateRadiusFromPointer(event); }} />
        <button aria-label="Adjust bottom-left corner radius" className={radiusHandleClass} data-radius-handle-object-id={objectId} style={radiusBottomLeftStyle} onPointerEnter={() => setRadiusHandleHover(true)} onPointerLeave={() => setRadiusHandleHover(false)} onPointerDown={(event) => startRadiusDrag(event, "bottom-left")} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateRadiusFromPointer(event); }} />
      </> : null}
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

function getAutoHeightTextBounds(object: FrameObject, editable: HTMLElement | null): Bounds | undefined {
  if (!editable) return undefined;
  const measuredHeight = Math.max(object.bounds.height, Math.ceil(editable.scrollHeight));
  return measuredHeight === object.bounds.height ? undefined : { ...object.bounds, height: measuredHeight };
}

function setObjectRadiusPreview(objectId: string, radius: number | null) {
  const target = document.querySelector<HTMLElement>(`[data-clipper-render-object-id="${cssEscape(objectId)}"]`);
  if (!target) return;
  if (radius === null) target.style.removeProperty("--clipper-radius-preview");
  else target.style.setProperty("--clipper-radius-preview", `${radius}px`);
}

export function DragSelectionBox({ dragSelectionBoxRef, bounds, frameScale, frameViewportRef, portalHost, uiScale, visible }: { dragSelectionBoxRef: RefObject<HTMLDivElement | null>; bounds: Bounds; frameScale: number; frameViewportRef: RefObject<HTMLDivElement | null>; portalHost?: HTMLElement | null; uiScale: number; visible: boolean }) {
  useLayoutEffect(() => {
    const element = dragSelectionBoxRef.current;
    if (!element) return;
    const frameRect = frameViewportRef.current?.getBoundingClientRect();
    const hostRect = portalHost?.getBoundingClientRect();
    const offset = frameRect && hostRect ? { x: frameRect.left - hostRect.left, y: frameRect.top - hostRect.top } : { x: 0, y: 0 };
    updateDragSelectionBoxElement(element, bounds, frameScale, visible, uiScale, offset);
  }, [bounds, dragSelectionBoxRef, frameScale, frameViewportRef, portalHost, uiScale, visible]);

  const box = <div ref={dragSelectionBoxRef} className="pointer-events-none absolute left-0 top-0 border bg-[#159dff]/10 opacity-100 will-change-transform" style={{ borderColor: selectorBlue, zIndex: 69 }} />;
  return portalHost ? createPortal(box, portalHost) : box;
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
